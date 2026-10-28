"use server";

import { and, eq, max } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  companies,
  priceTiers,
  routes,
  siteDefaultLines,
  siteMealPlans,
  sites,
} from "@/db/schema";
import {
  FormError,
  adminAction,
  checked,
  id,
  integer,
  optionalText,
  text,
  type FormState,
} from "@/lib/admin-form";
import { isMealKind, isMealSlot, type MealSlot } from "@/lib/meals";
import { isLineArray } from "@/lib/order-view";
import { normalizeLines, type OrderLine } from "@/lib/orders";

export async function createCompany(fd: FormData) {
  return adminAction(async () => {
    const [company] = await db
      .insert(companies)
      .values({
        name: text(fd, "name", "公司名稱", { max: 50 }),
        note: optionalText(fd, "note", "備註"),
      })
      .returning({ id: companies.id });
    redirect(`/admin/companies/${company.id}`);
  });
}

export async function updateCompany(companyId: number, fd: FormData) {
  return adminAction(async () => {
    await db
      .update(companies)
      .set({
        name: text(fd, "name", "公司名稱", { max: 50 }),
        note: optionalText(fd, "note", "備註"),
        active: checked(fd, "active"),
      })
      .where(eq(companies.id, id(companyId)));
  });
}

export async function createSite(companyId: number, fd: FormData) {
  return adminAction(async () => {
    const [site] = await db
      .insert(sites)
      .values({
        companyId: id(companyId),
        name: text(fd, "name", "廠區名稱", { max: 50 }),
      })
      .returning({ id: sites.id });
    redirect(`/admin/sites/${site.id}`);
  });
}

export async function updateSite(siteId: number, fd: FormData) {
  return adminAction(async () => {
    await db
      .update(sites)
      .set({
        name: text(fd, "name", "廠區名稱", { max: 50 }),
        address: optionalText(fd, "address", "地址"),
        contactName: optionalText(fd, "contactName", "聯絡人", 30),
        contactPhone: optionalText(fd, "contactPhone", "聯絡電話", 30),
        note: optionalText(fd, "note", "備註"),
        active: checked(fd, "active"),
      })
      .where(eq(sites.id, id(siteId)));
  });
}

function slotOf(value: unknown): MealSlot {
  if (!isMealSlot(value)) throw new FormError("餐次不正確");
  return value;
}

// Turns a meal slot on or off for a site and sets its route, price and
// ordering weekdays. Moving to another route puts the site at the end of it;
// reorder it on the route page.
export async function savePlan(siteId: number, slotValue: string, fd: FormData) {
  return adminAction(async () => {
    const site = id(siteId);
    const slot = slotOf(slotValue);
    const planKey = and(eq(siteMealPlans.siteId, site), eq(siteMealPlans.slot, slot));

    if (!checked(fd, "enabled")) {
      await db.transaction(async (tx) => {
        await tx
          .delete(siteDefaultLines)
          .where(and(eq(siteDefaultLines.siteId, site), eq(siteDefaultLines.slot, slot)));
        await tx.delete(siteMealPlans).where(planKey);
      });
      return "已停訂此餐次";
    }

    const routeId = integer(fd, "routeId", "路線", { min: 1 });
    const unitPrice = integer(fd, "unitPrice", "單價", { min: 1, max: 9999 });
    const weekdays = [1, 2, 3, 4, 5, 6].filter((d) => checked(fd, `wd${d}`));

    const [route] = await db
      .select({ slot: routes.slot })
      .from(routes)
      .where(eq(routes.id, routeId));
    if (route?.slot !== slot) throw new FormError("路線不屬於這個餐次");

    await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(siteMealPlans).where(planKey);
      let routeSeq = existing?.routeSeq ?? 0;
      if (existing?.routeId !== routeId) {
        const [{ last }] = await tx
          .select({ last: max(siteMealPlans.routeSeq) })
          .from(siteMealPlans)
          .where(eq(siteMealPlans.routeId, routeId));
        routeSeq = (last ?? -1) + 1;
      }
      const values = { routeId, routeSeq, unitPrice, orderWeekdays: weekdays };
      if (existing) await tx.update(siteMealPlans).set(values).where(planKey);
      else await tx.insert(siteMealPlans).values({ siteId: site, slot, ...values });
    });
  });
}

// Default quantities copied into each day's order. Prices must come from the
// price list (custom prices are per order only).
export async function saveDefaults(
  siteId: number,
  slotValue: string,
  lines: OrderLine[],
): Promise<FormState> {
  return adminAction(async () => {
    const site = id(siteId);
    const slot = slotOf(slotValue);
    if (
      !isLineArray(lines) ||
      !lines.every((l) => isMealKind(l.kind) && l.quantity >= 0 && l.quantity <= 9999)
    ) {
      throw new FormError("資料不正確");
    }
    const normalized = normalizeLines(lines);
    if (normalized.some((l) => l.kind === "other" && !l.label)) {
      throw new FormError("「其它」餐別請填寫內容");
    }
    const tiers = new Set(
      (await db.select({ price: priceTiers.price }).from(priceTiers)).map((t) => t.price),
    );
    if (normalized.some((l) => !tiers.has(l.unitPrice))) {
      throw new FormError("預設份數只能使用價位表上的價位");
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(siteDefaultLines)
        .where(and(eq(siteDefaultLines.siteId, site), eq(siteDefaultLines.slot, slot)));
      if (normalized.length > 0) {
        await tx.insert(siteDefaultLines).values(
          normalized.map((l) => ({
            siteId: site,
            slot,
            kind: l.kind,
            unitPrice: l.unitPrice,
            quantity: l.quantity,
            label: l.label ?? "",
          })),
        );
      }
    });
    return "已儲存預設份數（從下一次產生的訂單起生效）";
  });
}
