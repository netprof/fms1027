import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import {
  companies,
  priceTiers,
  routes,
  siteMealPlans,
  sites,
} from "@/db/schema";
import { requireEmployee } from "@/lib/auth";
import { currentSlot, taipeiDate, type MealSlot } from "@/lib/meals";
import { AdminPage } from "../admin-page";
import { StaffOrderEditor, type StaffSite } from "./staff-order-editor";

export const metadata: Metadata = { title: "電話改單" };

export default function StaffOrdersPage() {
  return (
    <AdminPage
      title="電話改單"
      note="員工代客戶調整訂單，不受截止時間限制；截止後的調整會在儀表板以藍色標示，並記錄原因。"
    >
      <Loader />
    </AdminPage>
  );
}

async function Loader() {
  await requireEmployee();
  const [rows, tiers] = await Promise.all([
    db
      .select({
        siteId: sites.id,
        siteName: sites.name,
        companyName: companies.name,
        slot: siteMealPlans.slot,
        routeName: routes.name,
      })
      .from(sites)
      .innerJoin(companies, eq(companies.id, sites.companyId))
      .innerJoin(siteMealPlans, eq(siteMealPlans.siteId, sites.id))
      .innerJoin(routes, eq(routes.id, siteMealPlans.routeId))
      .where(eq(sites.active, true))
      .orderBy(asc(companies.name), asc(sites.id)),
    db.select().from(priceTiers).orderBy(asc(priceTiers.price)),
  ]);

  const bySite = new Map<number, StaffSite>();
  for (const row of rows) {
    const site = bySite.get(row.siteId) ?? {
      id: row.siteId,
      label: `${row.companyName} ${row.siteName}`,
      routes: {} as Partial<Record<MealSlot, string>>,
    };
    site.routes[row.slot] = row.routeName;
    bySite.set(row.siteId, site);
  }

  return (
    <StaffOrderEditor
      sites={[...bySite.values()]}
      prices={tiers.map((t) => t.price).reverse()}
      initialDate={taipeiDate()}
      initialSlot={currentSlot()}
    />
  );
}
