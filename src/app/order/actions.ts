"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { menus, siteMealPlans } from "@/db/schema";
import {
  MEAL_KINDS,
  cutoffFor,
  isIsoDate,
  isMealKind,
  isMealSlot,
  type MealKind,
} from "@/lib/meals";
import {
  ensureDailyOrders,
  getOrderLines,
  isServiceDay,
  placeCustomerOrder,
  type OrderLine,
  type WriteResult,
} from "@/lib/orders";

export type LoadedOrder = {
  unitPrice: number;
  lines: OrderLine[];
  cutoffs: Record<MealKind, string>;
  serviceDay: boolean;
  menu: {
    mainDish: string;
    sideDishes: string[];
    soup: string;
    bMealItems: string[];
  } | null;
};

function parseKey(siteId: unknown, date: unknown, slot: unknown) {
  if (!Number.isInteger(siteId) || !isIsoDate(date) || !isMealSlot(slot)) {
    return null;
  }
  return { siteId: siteId as number, date, slot };
}

export async function loadOrder(
  siteId: number,
  date: string,
  slot: string,
): Promise<LoadedOrder | { error: string }> {
  const key = parseKey(siteId, date, slot);
  if (!key) return { error: "參數不正確" };

  const [plan] = await db
    .select({ unitPrice: siteMealPlans.unitPrice })
    .from(siteMealPlans)
    .where(
      and(eq(siteMealPlans.siteId, key.siteId), eq(siteMealPlans.slot, key.slot)),
    );
  if (!plan) return { error: "此廠區沒有訂這個餐次" };

  await ensureDailyOrders(key.date, key.slot);
  const [lines, serviceDay, [menu]] = await Promise.all([
    getOrderLines(key),
    isServiceDay(key.date),
    db
      .select()
      .from(menus)
      .where(and(eq(menus.date, key.date), eq(menus.slot, key.slot))),
  ]);

  return {
    unitPrice: plan.unitPrice,
    lines,
    serviceDay,
    cutoffs: Object.fromEntries(
      MEAL_KINDS.map((k) => [
        k,
        cutoffFor(key.date, key.slot, k).toISOString(),
      ]),
    ) as Record<MealKind, string>,
    menu: menu ?? null,
  };
}

export async function submitOrder(
  siteId: number,
  date: string,
  slot: string,
  lines: OrderLine[],
): Promise<WriteResult> {
  const key = parseKey(siteId, date, slot);
  if (
    !key ||
    !Array.isArray(lines) ||
    !lines.every(
      (l) =>
        isMealKind(l?.kind) &&
        Number.isInteger(l.unitPrice) &&
        Number.isInteger(l.quantity),
    )
  ) {
    return { ok: false, error: "參數不正確" };
  }
  return placeCustomerOrder(key, lines, "customer_web");
}
