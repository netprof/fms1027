// Order rules shared by every way an order can change: the simulated order
// page, the LINE bot (phase 2) and staff adjustments. See docs/spec.md.
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  holidays,
  orderChanges,
  orderLines,
  orders,
  priceTiers,
  siteDefaultLines,
  siteMealPlans,
  sites,
} from "@/db/schema";
import {
  KIND_LABEL,
  MEAL_KINDS,
  cutoffFor,
  formatCutoff,
  isMealKind,
  isoWeekday,
  type MealKind,
  type MealSlot,
} from "./meals";
import { ORDER_CHANNEL, type OrderEvent } from "./order-events";

export type OrderLine = { kind: MealKind; unitPrice: number; quantity: number };
export type OrderKey = { siteId: number; date: string; slot: MealSlot };
export type WriteResult =
  | { ok: true; changed: boolean }
  | { ok: false; error: string };

type ChangeMeta = {
  source: "customer_web" | "line" | "staff";
  employeeId?: number;
  reason?: string;
  afterCutoff: boolean;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function isServiceDay(date: string): Promise<boolean> {
  if (isoWeekday(date) === 7) return false;
  const [holiday] = await db
    .select({ date: holidays.date })
    .from(holidays)
    .where(eq(holidays.date, date))
    .limit(1);
  return !holiday;
}

// Merge duplicates, drop empty lines and sort, so two snapshots of the same
// order compare equal.
export function normalizeLines(lines: OrderLine[]): OrderLine[] {
  const merged = new Map<string, OrderLine>();
  for (const line of lines) {
    if (line.quantity <= 0) continue;
    const key = `${line.kind}:${line.unitPrice}`;
    const existing = merged.get(key);
    if (existing) existing.quantity += line.quantity;
    else merged.set(key, { ...line });
  }
  return [...merged.values()].sort(
    (a, b) =>
      MEAL_KINDS.indexOf(a.kind) - MEAL_KINDS.indexOf(b.kind) ||
      b.unitPrice - a.unitPrice,
  );
}

function changedKinds(before: OrderLine[], after: OrderLine[]): MealKind[] {
  const pick = (lines: OrderLine[], kind: MealKind) =>
    JSON.stringify(lines.filter((l) => l.kind === kind));
  return MEAL_KINDS.filter((k) => pick(before, k) !== pick(after, k));
}

async function readLines(tx: Tx | typeof db, orderId: number) {
  const rows = await tx
    .select({
      kind: orderLines.kind,
      unitPrice: orderLines.unitPrice,
      quantity: orderLines.quantity,
    })
    .from(orderLines)
    .where(eq(orderLines.orderId, orderId));
  return normalizeLines(rows);
}

export async function getOrderLines(key: OrderKey): Promise<OrderLine[]> {
  const [order] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(orderWhere(key));
  return order ? readLines(db, order.id) : [];
}

function orderWhere(key: OrderKey) {
  return and(
    eq(orders.siteId, key.siteId),
    eq(orders.date, key.date),
    eq(orders.slot, key.slot),
  );
}

// Returns an error message, or null when the input is acceptable.
async function validate(key: OrderKey, lines: OrderLine[]) {
  const [plan] = await db
    .select({ siteId: siteMealPlans.siteId })
    .from(siteMealPlans)
    .innerJoin(sites, eq(sites.id, siteMealPlans.siteId))
    .where(
      and(
        eq(siteMealPlans.siteId, key.siteId),
        eq(siteMealPlans.slot, key.slot),
        eq(sites.active, true),
      ),
    );
  if (!plan) return "此廠區沒有訂這個餐次";
  if (!(await isServiceDay(key.date))) return "當天不供餐";

  const prices = new Set(
    (await db.select({ price: priceTiers.price }).from(priceTiers)).map(
      (p) => p.price,
    ),
  );
  for (const line of lines) {
    if (!isMealKind(line.kind)) return "餐別不正確";
    if (!Number.isInteger(line.quantity) || line.quantity < 0)
      return "份數必須是 0 以上的整數";
    if (!prices.has(line.unitPrice)) return `沒有 ${line.unitPrice} 元的價位`;
  }
  return null;
}

// Locks the order row, compares old and new lines, and lets `decide` reject
// the change or describe it before anything is written.
async function writeOrder(
  key: OrderKey,
  lines: OrderLine[],
  decide: (changed: MealKind[]) => { error: string } | ChangeMeta,
): Promise<WriteResult> {
  return db.transaction(async (tx) => {
    await tx.insert(orders).values(key).onConflictDoNothing();
    const [order] = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(orderWhere(key))
      .for("update");

    const before = await readLines(tx, order.id);
    const after = normalizeLines(lines);
    const changed = changedKinds(before, after);
    if (changed.length === 0) return { ok: true, changed: false };

    const meta = decide(changed);
    if ("error" in meta) return { ok: false, error: meta.error };

    await tx.delete(orderLines).where(eq(orderLines.orderId, order.id));
    if (after.length > 0) {
      await tx
        .insert(orderLines)
        .values(after.map((l) => ({ ...l, orderId: order.id })));
    }
    await tx
      .update(orders)
      .set({ updatedAt: new Date() })
      .where(eq(orders.id, order.id));
    await tx.insert(orderChanges).values({
      orderId: order.id,
      source: meta.source,
      employeeId: meta.employeeId,
      reason: meta.reason,
      afterCutoff: meta.afterCutoff,
      before: { lines: before },
      after: { lines: after },
    });
    const event: OrderEvent = key;
    await tx.execute(
      sql`select pg_notify(${ORDER_CHANNEL}, ${JSON.stringify(event)})`,
    );
    return { ok: true, changed: true };
  });
}

// Customers (order page, LINE) may only change meal kinds still before cutoff.
export async function placeCustomerOrder(
  key: OrderKey,
  lines: OrderLine[],
  source: "customer_web" | "line",
  now: Date = new Date(),
): Promise<WriteResult> {
  const error = await validate(key, lines);
  if (error) return { ok: false, error };

  return writeOrder(key, lines, (changed) => {
    const closed = changed.filter(
      (k) => now >= cutoffFor(key.date, key.slot, k),
    );
    if (closed.length > 0) {
      const detail = closed
        .map(
          (k) =>
            `${KIND_LABEL[k]}（${formatCutoff(cutoffFor(key.date, key.slot, k))} 截止）`,
        )
        .join("、");
      return { error: `${detail}已截止，請來電由專人調整` };
    }
    return { source, afterCutoff: false };
  });
}

// Staff are not bound by cutoffs; changes past a cutoff are flagged.
export async function adjustOrderByStaff(
  key: OrderKey,
  lines: OrderLine[],
  by: { employeeId?: number; reason?: string },
  now: Date = new Date(),
): Promise<WriteResult> {
  const error = await validate(key, lines);
  if (error) return { ok: false, error };

  return writeOrder(key, lines, (changed) => ({
    source: "staff",
    ...by,
    afterCutoff: changed.some((k) => now >= cutoffFor(key.date, key.slot, k)),
  }));
}

// Creates the day's orders from each site's standing quantities. Idempotent:
// a site that already has an order for the day is left alone.
export async function ensureDailyOrders(date: string, slot: MealSlot) {
  if (!(await isServiceDay(date))) return;

  const missing = await db
    .select({ siteId: siteMealPlans.siteId })
    .from(siteMealPlans)
    .innerJoin(sites, eq(sites.id, siteMealPlans.siteId))
    .leftJoin(
      orders,
      and(
        eq(orders.siteId, siteMealPlans.siteId),
        eq(orders.date, date),
        eq(orders.slot, slot),
      ),
    )
    .where(
      and(
        eq(siteMealPlans.slot, slot),
        eq(sites.active, true),
        sql`${isoWeekday(date)} = any(${siteMealPlans.orderWeekdays})`,
        isNull(orders.id),
      ),
    );
  if (missing.length === 0) return;

  const siteIds = missing.map((m) => m.siteId);
  const defaults = await db
    .select()
    .from(siteDefaultLines)
    .where(
      and(
        eq(siteDefaultLines.slot, slot),
        inArray(siteDefaultLines.siteId, siteIds),
      ),
    );

  for (const siteId of siteIds) {
    const lines = normalizeLines(
      defaults
        .filter((d) => d.siteId === siteId)
        .map(({ kind, unitPrice, quantity }) => ({ kind, unitPrice, quantity })),
    );
    await db.transaction(async (tx) => {
      const [order] = await tx
        .insert(orders)
        .values({ siteId, date, slot })
        .onConflictDoNothing()
        .returning({ id: orders.id });
      if (!order) return;
      if (lines.length > 0) {
        await tx
          .insert(orderLines)
          .values(lines.map((l) => ({ ...l, orderId: order.id })));
      }
      await tx.insert(orderChanges).values({
        orderId: order.id,
        source: "system",
        after: { lines },
      });
    });
  }
}
