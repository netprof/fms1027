"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { employees, lineContacts, orderChanges, orders } from "@/db/schema";
import { requireEmployee } from "@/lib/auth";
import { notifyStaffChange } from "@/lib/line/notify";
import {
  isLineArray,
  loadOrderView,
  parseOrderKey,
  type OrderView,
} from "@/lib/order-view";
import {
  adjustOrderByStaff,
  normalizeLines,
  type OrderLine,
  type WriteResult,
} from "@/lib/orders";

export type HistoryEntry = {
  id: number;
  at: string;
  source: "system" | "customer_web" | "line" | "staff";
  // The staff member, or the LINE contact, who made the change.
  employeeName: string | null;
  reason: string | null;
  afterCutoff: boolean;
  before: OrderLine[];
  after: OrderLine[];
};

export type StaffOrderView = OrderView & { history: HistoryEntry[] };

const MAX_REASON = 100;

const snapshot = (value: unknown) =>
  normalizeLines((value as { lines?: OrderLine[] } | null)?.lines ?? []);

export async function loadStaffOrder(
  siteId: number,
  date: string,
  slot: string,
): Promise<StaffOrderView | { error: string }> {
  await requireEmployee();
  const key = parseOrderKey(siteId, date, slot);
  if (!key) return { error: "參數不正確" };

  const view = await loadOrderView(key);
  if ("error" in view) return view;

  const rows = await db
    .select({
      id: orderChanges.id,
      createdAt: orderChanges.createdAt,
      source: orderChanges.source,
      employeeName: sql<string | null>`coalesce(${employees.name}, ${lineContacts.name})`,
      reason: orderChanges.reason,
      afterCutoff: orderChanges.afterCutoff,
      before: orderChanges.before,
      after: orderChanges.after,
    })
    .from(orderChanges)
    .innerJoin(orders, eq(orders.id, orderChanges.orderId))
    .leftJoin(employees, eq(employees.id, orderChanges.employeeId))
    .leftJoin(lineContacts, eq(lineContacts.id, orderChanges.lineContactId))
    .where(
      and(
        eq(orders.siteId, key.siteId),
        eq(orders.date, key.date),
        eq(orders.slot, key.slot),
      ),
    )
    .orderBy(desc(orderChanges.createdAt));

  return {
    ...view,
    history: rows.map((r) => ({
      id: r.id,
      at: r.createdAt.toISOString(),
      source: r.source,
      employeeName: r.employeeName,
      reason: r.reason,
      afterCutoff: r.afterCutoff,
      before: snapshot(r.before),
      after: snapshot(r.after),
    })),
  };
}

export async function adjustOrder(
  siteId: number,
  date: string,
  slot: string,
  lines: OrderLine[],
  reason: string,
): Promise<WriteResult> {
  const employee = await requireEmployee();
  const key = parseOrderKey(siteId, date, slot);
  if (!key || !isLineArray(lines) || typeof reason !== "string") {
    return { ok: false, error: "參數不正確" };
  }
  const why = reason.trim();
  if (!why) return { ok: false, error: "請填寫調整原因" };
  if (why.length > MAX_REASON) {
    return { ok: false, error: `原因最多 ${MAX_REASON} 字` };
  }
  const result = await adjustOrderByStaff(key, lines, {
    employeeId: employee.id,
    reason: why,
  });
  // Customers hear about changes made after cutoff on their behalf.
  if (result.ok && result.changed && result.afterCutoff) {
    const { after: lines } = result;
    after(() => notifyStaffChange(key, lines));
  }
  return result;
}
