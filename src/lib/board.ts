// Data for the dashboard: routes in order, their sites in delivery order and
// each site's order for one date and meal slot, with per-line change marks.
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  companies,
  employees,
  orderChanges,
  orderLines,
  orders,
  priceTiers,
  routeDriverOverrides,
  routes,
  siteMealPlans,
  sites,
} from "@/db/schema";
import { classifyChange, lineKey, type ChangeKind } from "./changes";
import type { MealSlot } from "./meals";
import { isServiceDay, normalizeLines, type OrderLine } from "./orders";

export type { ChangeKind };

const RECENT_LIMIT = 30;

export type BoardLine = OrderLine & {
  // Latest change to this line by a customer or staff, not the daily default.
  change: { kind: ChangeKind; at: string; afterCutoff: boolean } | null;
  // Staff changed this line after its cutoff at some point.
  staffAfterCutoff: boolean;
};

export type BoardSite = {
  siteId: number;
  name: string;
  companyName: string;
  unitPrice: number;
  lines: BoardLine[];
  // Lines cancelled by a change, with the quantity they had before.
  removed: BoardLine[];
};

export type BoardRoute = {
  routeId: number;
  name: string;
  driver: { name: string; phone: string } | null;
  standIn: boolean;
  sites: BoardSite[];
};

// One customer or staff change, newest first on the board.
export type RecentChange = {
  id: number;
  at: string;
  siteLabel: string;
  source: "customer_web" | "line" | "staff";
  employeeName: string | null;
  afterCutoff: boolean;
  kind: ChangeKind;
  before: OrderLine[];
  after: OrderLine[];
};

export type Board = {
  date: string;
  slot: MealSlot;
  serviceDay: boolean;
  // Highest first; the dashboard colours prices by this order.
  priceTiers: number[];
  routes: BoardRoute[];
  recentChanges: RecentChange[];
  serverNow: string;
};

type Mark = Omit<BoardLine, keyof OrderLine> & { previous: OrderLine };

const snapshot = (value: unknown) =>
  normalizeLines((value as { lines?: OrderLine[] } | null)?.lines ?? []);

// Replays an order's changes oldest first and keeps, per line, the last one
// that touched it.
function markLines(
  changes: { before: unknown; after: unknown; createdAt: Date; source: string; afterCutoff: boolean }[],
) {
  const marks = new Map<string, Mark>();
  for (const change of changes) {
    const before = new Map(snapshot(change.before).map((l) => [lineKey(l), l]));
    const after = new Map(snapshot(change.after).map((l) => [lineKey(l), l]));
    for (const key of new Set([...before.keys(), ...after.keys()])) {
      const b = before.get(key);
      const a = after.get(key);
      if (b?.quantity === a?.quantity) continue;
      const staffAfterCutoff = change.source === "staff" && change.afterCutoff;
      marks.set(key, {
        change: {
          kind: !a ? "cancelled" : !b ? "new" : "modified",
          at: change.createdAt.toISOString(),
          afterCutoff: staffAfterCutoff,
        },
        staffAfterCutoff:
          staffAfterCutoff || (marks.get(key)?.staffAfterCutoff ?? false),
        previous: (b ?? a)!,
      });
    }
  }
  return marks;
}

export async function getBoard(date: string, slot: MealSlot): Promise<Board> {
  const [routeRows, overrides, people, plans, orderRows, tiers] =
    await Promise.all([
      db
        .select()
        .from(routes)
        .where(and(eq(routes.slot, slot), eq(routes.active, true)))
        .orderBy(asc(routes.sortOrder), asc(routes.id)),
      db
        .select()
        .from(routeDriverOverrides)
        .where(eq(routeDriverOverrides.date, date)),
      db
        .select({ id: employees.id, name: employees.name, phone: employees.phone })
        .from(employees),
      db
        .select({
          siteId: sites.id,
          name: sites.name,
          companyName: companies.name,
          routeId: siteMealPlans.routeId,
          unitPrice: siteMealPlans.unitPrice,
        })
        .from(siteMealPlans)
        .innerJoin(sites, eq(sites.id, siteMealPlans.siteId))
        .innerJoin(companies, eq(companies.id, sites.companyId))
        .where(and(eq(siteMealPlans.slot, slot), eq(sites.active, true)))
        .orderBy(asc(siteMealPlans.routeSeq), asc(sites.id)),
      db
        .select({ id: orders.id, siteId: orders.siteId })
        .from(orders)
        .where(and(eq(orders.date, date), eq(orders.slot, slot))),
      db
        .select({ price: priceTiers.price })
        .from(priceTiers)
        .orderBy(desc(priceTiers.price)),
    ]);

  const orderIds = orderRows.map((o) => o.id);
  const [lineRows, changeRows] = orderIds.length
    ? await Promise.all([
        db
          .select()
          .from(orderLines)
          .where(inArray(orderLines.orderId, orderIds)),
        db
          .select()
          .from(orderChanges)
          .where(
            and(
              inArray(orderChanges.orderId, orderIds),
              ne(orderChanges.source, "system"),
            ),
          )
          .orderBy(asc(orderChanges.orderId), asc(orderChanges.createdAt)),
      ])
    : [[], []];

  const orderBySite = new Map(orderRows.map((o) => [o.siteId, o.id]));
  const peopleById = new Map(people.map((p) => [p.id, p]));
  const overrideByRoute = new Map(overrides.map((o) => [o.routeId, o]));

  const siteByOrder = new Map(
    orderRows.map((o) => [o.id, plans.find((p) => p.siteId === o.siteId)]),
  );
  const recentChanges = (): RecentChange[] =>
    // changeRows is ordered per order; sort the whole day newest first.
    [...changeRows]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id)
      .slice(0, RECENT_LIMIT)
      .map((c) => {
        const plan = siteByOrder.get(c.orderId);
        const before = snapshot(c.before);
        const after = snapshot(c.after);
        return {
          id: c.id,
          at: c.createdAt.toISOString(),
          siteLabel: plan ? `${plan.companyName}${plan.name}` : "",
          source: c.source as RecentChange["source"],
          employeeName: c.employeeId
            ? (peopleById.get(c.employeeId)?.name ?? null)
            : null,
          afterCutoff: c.afterCutoff,
          kind: classifyChange(before, after),
          before,
          after,
        };
      });

  const toSite = (plan: (typeof plans)[number]): BoardSite => {
    const orderId = orderBySite.get(plan.siteId);
    const marks = markLines(changeRows.filter((c) => c.orderId === orderId));
    const current = normalizeLines(
      lineRows
        .filter((l) => l.orderId === orderId)
        .map(({ kind, unitPrice, quantity, label }) => ({
          kind,
          unitPrice,
          quantity,
          label,
        })),
    );
    const currentKeys = new Set(current.map(lineKey));
    const withMark = (line: OrderLine): BoardLine => {
      const mark = marks.get(lineKey(line));
      return {
        ...line,
        change: mark?.change ?? null,
        staffAfterCutoff: mark?.staffAfterCutoff ?? false,
      };
    };

    return {
      siteId: plan.siteId,
      name: plan.name,
      companyName: plan.companyName,
      unitPrice: plan.unitPrice,
      lines: current.map(withMark),
      removed: [...marks.entries()]
        .filter(
          ([key, m]) => m.change?.kind === "cancelled" && !currentKeys.has(key),
        )
        .map(([, m]) => withMark(m.previous)),
    };
  };

  return {
    date,
    slot,
    serviceDay: await isServiceDay(date),
    priceTiers: tiers.map((t) => t.price),
    recentChanges: recentChanges(),
    serverNow: new Date().toISOString(),
    routes: routeRows.map((route) => {
      const override = overrideByRoute.get(route.id);
      const driverId = override?.driverId ?? route.defaultDriverId;
      const driver = driverId ? peopleById.get(driverId) : undefined;
      return {
        routeId: route.id,
        name: route.name,
        driver: driver ? { name: driver.name, phone: driver.phone } : null,
        standIn: !!override,
        sites: plans.filter((p) => p.routeId === route.id).map(toSite),
      };
    }),
  };
}
