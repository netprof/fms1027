// What an order editor needs for one site, date and slot. Callers do their
// own authorisation; this only reads.
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { menus, siteMealPlans } from "@/db/schema";
import {
  MEAL_KINDS,
  cutoffFor,
  isIsoDate,
  isMealSlot,
  type MealKind,
} from "./meals";
import {
  ensureDailyOrders,
  getOrderLines,
  isServiceDay,
  type OrderKey,
  type OrderLine,
} from "./orders";

export type Menu = {
  mainDish: string;
  sideDishes: string[];
  soup: string;
  bMealItems: string[];
};

export type OrderView = {
  unitPrice: number;
  lines: OrderLine[];
  cutoffs: Record<MealKind, string>;
  serviceDay: boolean;
  menu: Menu | null;
};

// Validates untrusted input from a Server Action into an order key.
export function parseOrderKey(
  siteId: unknown,
  date: unknown,
  slot: unknown,
): OrderKey | null {
  if (!Number.isInteger(siteId) || !isIsoDate(date) || !isMealSlot(slot)) {
    return null;
  }
  return { siteId: siteId as number, date, slot };
}

export async function loadOrderView(
  key: OrderKey,
): Promise<OrderView | { error: string }> {
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
      .select({
        mainDish: menus.mainDish,
        sideDishes: menus.sideDishes,
        soup: menus.soup,
        bMealItems: menus.bMealItems,
      })
      .from(menus)
      .where(and(eq(menus.date, key.date), eq(menus.slot, key.slot))),
  ]);

  return {
    unitPrice: plan.unitPrice,
    lines,
    serviceDay,
    cutoffs: Object.fromEntries(
      MEAL_KINDS.map((k) => [k, cutoffFor(key.date, key.slot, k).toISOString()]),
    ) as Record<MealKind, string>,
    menu: menu ?? null,
  };
}

// Server Action input is untrusted: check the shape of each line.
export function isLineArray(value: unknown): value is OrderLine[] {
  return (
    Array.isArray(value) &&
    value.every(
      (l) =>
        typeof l === "object" &&
        l !== null &&
        typeof l.kind === "string" &&
        Number.isInteger(l.unitPrice) &&
        Number.isInteger(l.quantity) &&
        (l.label === undefined || typeof l.label === "string"),
    )
  );
}
