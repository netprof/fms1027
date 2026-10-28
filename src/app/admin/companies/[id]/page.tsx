import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { inputClass, labelClass, tableClass } from "@/components/styles";
import { db } from "@/db";
import { companies, routes, siteMealPlans, sites } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { SLOT_LABEL } from "@/lib/meals";
import { AdminPage } from "../../admin-page";
import { createSite, updateCompany } from "../actions";

export const metadata: Metadata = { title: "客戶廠區" };

export default function CompanyPage({ params }: PageProps<"/admin/companies/[id]">) {
  return (
    <AdminPage>
      <Content params={params} />
    </AdminPage>
  );
}

async function Content({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const companyId = Number((await params).id);
  if (!Number.isInteger(companyId)) notFound();
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
  if (!company) notFound();

  const [siteRows, plans] = await Promise.all([
    db.select().from(sites).where(eq(sites.companyId, companyId)).orderBy(asc(sites.id)),
    db
      .select({
        siteId: siteMealPlans.siteId,
        slot: siteMealPlans.slot,
        unitPrice: siteMealPlans.unitPrice,
        routeName: routes.name,
      })
      .from(siteMealPlans)
      .innerJoin(sites, eq(sites.id, siteMealPlans.siteId))
      .innerJoin(routes, eq(routes.id, siteMealPlans.routeId))
      .where(eq(sites.companyId, companyId)),
  ]);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-2 text-xl font-semibold">{company.name}</h2>
        <ActionForm action={updateCompany.bind(null, company.id)} className="flex flex-wrap items-end gap-3">
          <label className={labelClass}>
            公司名稱
            <input name="name" required maxLength={50} defaultValue={company.name} className={`${inputClass} w-48`} />
          </label>
          <label className={labelClass}>
            備註
            <input name="note" maxLength={200} defaultValue={company.note ?? ""} className={`${inputClass} w-64`} />
          </label>
          <label className="flex items-center gap-1 pb-1 text-sm">
            <input type="checkbox" name="active" defaultChecked={company.active} />
            往來中
          </label>
        </ActionForm>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">廠區（{siteRows.length}）</h2>
        <ActionForm action={createSite.bind(null, company.id)} submitLabel="新增廠區" className="flex flex-wrap items-end gap-3">
          <label className={labelClass}>
            廠區名稱
            <input name="name" required maxLength={50} placeholder="例如：一廠" className={`${inputClass} w-40`} />
          </label>
        </ActionForm>
        <table className={tableClass}>
          <thead>
            <tr>
              <th>廠區</th>
              <th>地址</th>
              <th>聯絡人</th>
              <th>午餐</th>
              <th>晚餐</th>
            </tr>
          </thead>
          <tbody>
            {siteRows.map((s) => (
              <tr key={s.id} className={s.active ? "" : "opacity-50"}>
                <td>
                  <Link href={`/admin/sites/${s.id}`} className="text-primary hover:underline">
                    {s.name}
                  </Link>
                  {!s.active && "（停用）"}
                </td>
                <td className="text-zinc-600">{s.address}</td>
                <td className="text-zinc-600">
                  {s.contactName} {s.contactPhone}
                </td>
                {(["lunch", "dinner"] as const).map((slot) => {
                  const plan = plans.find((p) => p.siteId === s.id && p.slot === slot);
                  return (
                    <td key={slot} className="text-zinc-600">
                      {plan ? `${plan.routeName}・${plan.unitPrice} 元` : <span className="text-zinc-300">未訂{SLOT_LABEL[slot]}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
