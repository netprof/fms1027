// Data for the dashboard: routes in order, their sites in delivery order and
// each site's order for one date and meal slot.
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  companies,
  employees,
  orderChanges,
  orderLines,
  orders,
  routeDriverOverrides,
  routes,
  siteMealPlans,
  sites,
} from "@/db/schema";
import type { MealSlot } from "./meals";
import { isServiceDay, normalizeLines, type OrderLine } from "./orders";

export type ChangeKind = "new" | "modified" | "cancelled";

export type BoardSite = {
  siteId: number;
  name: string;
  companyName: string;
  unitPrice: number;
  lines: OrderLine[];
  // Latest change by a customer or staff, not the daily default.
  lastChange: { kind: ChangeKind; at: string; afterCutoff: boolean } | null;
  // Staff changed this order after a cutoff at some point today.
  staffAfterCutoff: boolean;
};

export type BoardRoute = {
  routeId: number;
  name: string;
  driver: { name: string; phone: string } | null;
  standIn: boolean;
  sites: BoardSite[];
};

export type Board = {
  date: string;
  slot: MealSlot;
  serviceDay: boolean;
  routes: BoardRoute[];
  serverNow: string;
};

const total = (lines: OrderLine[] | undefined) =>
  (lines ?? []).reduce((sum, l) => sum + l.quantity, 0);

function classify(before: OrderLine[], after: OrderLine[]): ChangeKind {
  if (total(after) === 0) return "cancelled";
  if (total(before) === 0) return "new";
  return "modified";
}

export async function getBoard(date: string, slot: MealSlot): Promise<Board> {
  const [routeRows, overrides, people, plans, orderRows] = await Promise.all([
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
  ]);

  const orderIds = orderRows.map((o) => o.id);
  const [lineRows, latestChanges, staffFlags] = orderIds.length
    ? await Promise.all([
        db
          .select()
          .from(orderLines)
          .where(inArray(orderLines.orderId, orderIds)),
        db
          .selectDistinctOn([orderChanges.orderId])
          .from(orderChanges)
          .where(
            and(
              inArray(orderChanges.orderId, orderIds),
              ne(orderChanges.source, "system"),
            ),
          )
          .orderBy(orderChanges.orderId, desc(orderChanges.createdAt)),
        db
          .select({ orderId: orderChanges.orderId })
          .from(orderChanges)
          .where(
            and(
              inArray(orderChanges.orderId, orderIds),
              eq(orderChanges.source, "staff"),
              eq(orderChanges.afterCutoff, true),
            ),
          )
          .groupBy(orderChanges.orderId),
      ])
    : [[], [], []];

  const orderBySite = new Map(orderRows.map((o) => [o.siteId, o.id]));
  const staffFlagged = new Set(staffFlags.map((f) => f.orderId));
  const changeByOrder = new Map(latestChanges.map((c) => [c.orderId, c]));
  const peopleById = new Map(people.map((p) => [p.id, p]));
  const overrideByRoute = new Map(overrides.map((o) => [o.routeId, o]));

  const toSite = (plan: (typeof plans)[number]): BoardSite => {
    const orderId = orderBySite.get(plan.siteId);
    const change = orderId ? changeByOrder.get(orderId) : undefined;
    const snapshot = (value: unknown) =>
      (value as { lines?: OrderLine[] } | null)?.lines ?? [];
    return {
      siteId: plan.siteId,
      name: plan.name,
      companyName: plan.companyName,
      unitPrice: plan.unitPrice,
      lines: normalizeLines(
        lineRows
          .filter((l) => l.orderId === orderId)
          .map(({ kind, unitPrice, quantity, label }) => ({
            kind,
            unitPrice,
            quantity,
            label,
          })),
      ),
      lastChange: change
        ? {
            kind: classify(snapshot(change.before), snapshot(change.after)),
            at: change.createdAt.toISOString(),
            afterCutoff: change.afterCutoff,
          }
        : null,
      staffAfterCutoff: orderId ? staffFlagged.has(orderId) : false,
    };
  };

  return {
    date,
    slot,
    serviceDay: await isServiceDay(date),
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
