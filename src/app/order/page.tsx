import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/db";
import { companies, priceTiers, siteMealPlans, sites } from "@/db/schema";
import { currentSlot, taipeiDate, type MealSlot } from "@/lib/meals";
import { OrderForm, type SiteOption } from "./order-form";

export const metadata: Metadata = { title: "模擬下單" };

export default function OrderPage() {
  return (
    <main className="mx-auto w-full max-w-2xl p-4 sm:p-8">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">模擬下單</h1>
        <Link href="/board" className="text-sm text-blue-600 hover:underline">
          看儀表板 →
        </Link>
      </div>
      <p className="mb-6 text-sm text-zinc-500">
        模擬客戶下單，規則與之後的 LINE Bot 相同：超過截止時間只能來電，由員工在後台調整。
      </p>
      <Suspense fallback={<p className="text-zinc-500">載入中…</p>}>
        <OrderLoader />
      </Suspense>
    </main>
  );
}

async function OrderLoader() {
  const [rows, tiers] = await Promise.all([
    db
      .select({
        siteId: sites.id,
        siteName: sites.name,
        companyName: companies.name,
        slot: siteMealPlans.slot,
      })
      .from(sites)
      .innerJoin(companies, eq(companies.id, sites.companyId))
      .innerJoin(siteMealPlans, eq(siteMealPlans.siteId, sites.id))
      .where(eq(sites.active, true))
      .orderBy(asc(companies.name), asc(sites.name)),
    db.select().from(priceTiers).orderBy(asc(priceTiers.price)),
  ]);

  const bySite = new Map<number, SiteOption>();
  for (const row of rows) {
    const site = bySite.get(row.siteId) ?? {
      id: row.siteId,
      label: `${row.companyName} ${row.siteName}`,
      slots: [] as MealSlot[],
    };
    site.slots.push(row.slot);
    bySite.set(row.siteId, site);
  }

  return (
    <OrderForm
      sites={[...bySite.values()]}
      prices={tiers.map((t) => t.price).reverse()}
      initialDate={taipeiDate()}
      initialSlot={currentSlot()}
    />
  );
}
