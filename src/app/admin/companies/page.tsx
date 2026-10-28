import { asc, count, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { inputClass, labelClass, tableClass } from "@/components/styles";
import { db } from "@/db";
import { companies, sites } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { AdminPage } from "../admin-page";
import { createCompany } from "./actions";

export const metadata: Metadata = { title: "客戶" };

export default function CompaniesPage() {
  return (
    <AdminPage title="客戶" note="公司是帳務單位；廠區是下單、配送與計價的單位。點公司名稱管理其廠區。">
      <Content />
    </AdminPage>
  );
}

async function Content() {
  await requireAdmin();
  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      note: companies.note,
      active: companies.active,
      siteCount: count(sites.id),
    })
    .from(companies)
    .leftJoin(sites, eq(sites.companyId, companies.id))
    .groupBy(companies.id)
    .orderBy(asc(companies.name));

  return (
    <div className="space-y-6">
      <ActionForm action={createCompany} submitLabel="新增公司" className="flex flex-wrap items-end gap-3">
        <label className={labelClass}>
          公司名稱
          <input name="name" required maxLength={50} className={`${inputClass} w-48`} />
        </label>
        <label className={labelClass}>
          備註
          <input name="note" maxLength={200} className={`${inputClass} w-64`} />
        </label>
      </ActionForm>

      <table className={tableClass}>
        <thead>
          <tr>
            <th>公司</th>
            <th>廠區數</th>
            <th>備註</th>
            <th>狀態</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className={c.active ? "" : "opacity-50"}>
              <td>
                <Link href={`/admin/companies/${c.id}`} className="text-primary hover:underline">
                  {c.name}
                </Link>
              </td>
              <td className="tabular-nums">{c.siteCount}</td>
              <td className="text-zinc-600">{c.note}</td>
              <td>{c.active ? "往來中" : "停用"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
