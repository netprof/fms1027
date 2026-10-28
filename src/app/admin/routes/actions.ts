"use server";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { routeDriverOverrides, routes, siteMealPlans } from "@/db/schema";
import {
  FormError,
  adminAction,
  checked,
  date,
  id,
  integer,
  text,
} from "@/lib/admin-form";
import { isIsoDate, isMealSlot } from "@/lib/meals";

// "" means no default driver.
function driverId(fd: FormData): number | null {
  const raw = String(fd.get("driverId") ?? "");
  return raw ? integer(fd, "driverId", "司機", { min: 1 }) : null;
}

export async function createRoute(slot: string, fd: FormData) {
  return adminAction(async () => {
    if (!isMealSlot(slot)) throw new FormError("餐次不正確");
    await db.insert(routes).values({
      slot,
      name: text(fd, "name", "路線名稱", { max: 30 }),
      defaultDriverId: driverId(fd),
      sortOrder: integer(fd, "sortOrder", "排序", { max: 999 }),
    });
    return "已新增";
  });
}

export async function updateRoute(routeId: number, fd: FormData) {
  return adminAction(async () => {
    await db
      .update(routes)
      .set({
        name: text(fd, "name", "路線名稱", { max: 30 }),
        defaultDriverId: driverId(fd),
        sortOrder: integer(fd, "sortOrder", "排序", { max: 999 }),
        active: checked(fd, "active"),
      })
      .where(eq(routes.id, id(routeId)));
  });
}

// Moves a site one step up or down the route and renumbers the route 0…n-1.
export async function moveSite(routeId: number, siteId: number, step: number) {
  return adminAction(async () => {
    const route = id(routeId);
    const site = id(siteId);
    if (step !== -1 && step !== 1) throw new FormError("資料不正確");
    await db.transaction(async (tx) => {
      const order = await tx
        .select({ siteId: siteMealPlans.siteId, slot: siteMealPlans.slot })
        .from(siteMealPlans)
        .where(eq(siteMealPlans.routeId, route))
        .orderBy(asc(siteMealPlans.routeSeq), asc(siteMealPlans.siteId));
      const from = order.findIndex((p) => p.siteId === site);
      const to = from + step;
      if (from < 0 || to < 0 || to >= order.length) return;
      [order[from], order[to]] = [order[to], order[from]];
      for (const [seq, p] of order.entries()) {
        await tx
          .update(siteMealPlans)
          .set({ routeSeq: seq })
          .where(and(eq(siteMealPlans.siteId, p.siteId), eq(siteMealPlans.slot, p.slot)));
      }
    });
  });
}

export async function addOverride(routeId: number, fd: FormData) {
  return adminAction(async () => {
    const values = {
      routeId: id(routeId),
      date: date(fd, "date", "日期"),
      driverId: integer(fd, "driverId", "代班司機", { min: 1 }),
    };
    // One stand-in per route and day: a second entry replaces the first.
    await db
      .insert(routeDriverOverrides)
      .values(values)
      .onConflictDoUpdate({
        target: [routeDriverOverrides.routeId, routeDriverOverrides.date],
        set: { driverId: values.driverId },
      });
    return "已設定代班";
  });
}

export async function deleteOverride(routeId: number, day: string) {
  return adminAction(async () => {
    if (!isIsoDate(day)) throw new FormError("日期不正確");
    await db
      .delete(routeDriverOverrides)
      .where(
        and(eq(routeDriverOverrides.routeId, id(routeId)), eq(routeDriverOverrides.date, day)),
      );
    return "已取消代班";
  });
}
