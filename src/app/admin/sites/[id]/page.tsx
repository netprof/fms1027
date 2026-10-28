import { asc, desc, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { inputClass, labelClass, tableClass } from "@/components/styles";
import { db } from "@/db";
import {
  companies,
  employees,
  lineContacts,
  priceTiers,
  routes,
  siteDefaultLines,
  siteMealPlans,
  sites,
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { MEAL_SLOTS, SLOT_LABEL } from "@/lib/meals";
import { normalizeLines } from "@/lib/orders";
import { AdminPage } from "../../admin-page";
import { savePlan, updateSite } from "../../companies/actions";
import { DefaultsEditor } from "./defaults-editor";
import {
  addLineContact,
  deleteLineContact,
  renewBindCode,
  unbindLineContact,
} from "./line-actions";

export const metadata: Metadata = { title: "廠區設定" };

const WEEKDAYS = ["一", "二", "三", "四", "五", "六"];

export default function SitePage({ params }: PageProps<"/admin/sites/[id]">) {
  return (
    <AdminPage>
      <Content params={params} />
    </AdminPage>
  );
}

async function Content({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const siteId = Number((await params).id);
  if (!Number.isInteger(siteId)) notFound();
  const [site] = await db
    .select({ site: sites, companyName: companies.name })
    .from(sites)
    .innerJoin(companies, eq(companies.id, sites.companyId))
    .where(eq(sites.id, siteId));
  if (!site) notFound();
  const s = site.site;

  const [plans, defaults, routeRows, tiers, contacts] = await Promise.all([
    db.select().from(siteMealPlans).where(eq(siteMealPlans.siteId, siteId)),
    db.select().from(siteDefaultLines).where(eq(siteDefaultLines.siteId, siteId)),
    db
      .select({ id: routes.id, slot: routes.slot, name: routes.name, driver: employees.name })
      .from(routes)
      .leftJoin(employees, eq(employees.id, routes.defaultDriverId))
      .where(eq(routes.active, true))
      .orderBy(asc(routes.sortOrder), asc(routes.id)),
    db.select().from(priceTiers).orderBy(desc(priceTiers.price)),
    db
      .select({
        id: lineContacts.id,
        name: lineContacts.name,
        bound: sql<boolean>`${lineContacts.lineUserId} is not null`,
        displayName: lineContacts.displayName,
        boundAt: lineContacts.boundAt,
        bindCode: lineContacts.bindCode,
        expiresAt: lineContacts.bindCodeExpiresAt,
        // Compared in SQL: no JS clock in a prerendered component.
        expired: sql<boolean>`coalesce(${lineContacts.bindCodeExpiresAt} <= now(), true)`,
      })
      .from(lineContacts)
      .where(eq(lineContacts.siteId, siteId))
      .orderBy(asc(lineContacts.id)),
  ]);
  const prices = tiers.map((t) => t.price);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-2 text-xl font-semibold">
          <Link href={`/admin/companies/${s.companyId}`} className="hover:underline">
            {site.companyName}
          </Link>{" "}
          {s.name}
        </h2>
        <ActionForm action={updateSite.bind(null, s.id)} className="flex flex-wrap items-end gap-3">
          <label className={labelClass}>
            廠區名稱
            <input name="name" required maxLength={50} defaultValue={s.name} className={`${inputClass} w-32`} />
          </label>
          <label className={labelClass}>
            地址
            <input name="address" maxLength={200} defaultValue={s.address ?? ""} className={`${inputClass} w-72`} />
          </label>
          <label className={labelClass}>
            聯絡人
            <input name="contactName" maxLength={30} defaultValue={s.contactName ?? ""} className={`${inputClass} w-24`} />
          </label>
          <label className={labelClass}>
            聯絡電話
            <input name="contactPhone" maxLength={30} defaultValue={s.contactPhone ?? ""} className={`${inputClass} w-36`} />
          </label>
          <label className={labelClass}>
            備註
            <input name="note" maxLength={200} defaultValue={s.note ?? ""} className={`${inputClass} w-48`} />
          </label>
          <label className="flex items-center gap-1 pb-1 text-sm">
            <input type="checkbox" name="active" defaultChecked={s.active} />
            啟用
          </label>
        </ActionForm>
      </section>

      {MEAL_SLOTS.map((slot) => {
        const plan = plans.find((p) => p.slot === slot);
        const slotRoutes = routeRows.filter((r) => r.slot === slot);
        return (
          <section key={slot} className="space-y-3 rounded-lg border border-slate-200 p-4">
            <h2 className="font-medium">{SLOT_LABEL[slot]}</h2>
            <ActionForm
              action={savePlan.bind(null, s.id, slot)}
              className="flex flex-wrap items-end gap-3"
            >
              <label className="flex items-center gap-1 pb-1 text-sm">
                <input type="checkbox" name="enabled" defaultChecked={!!plan} />
                訂{SLOT_LABEL[slot]}
              </label>
              <label className={labelClass}>
                路線
                <select name="routeId" defaultValue={plan?.routeId ?? slotRoutes[0]?.id} className={inputClass}>
                  {slotRoutes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.driver ? `（${r.driver}）` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                固定單價
                <select name="unitPrice" defaultValue={plan?.unitPrice ?? prices[0]} className={inputClass}>
                  {prices.map((p) => (
                    <option key={p} value={p}>
                      {p} 元
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className={labelClass}>
                <legend className="mb-1">每天自動產生訂單</legend>
                <span className="flex gap-2 text-sm text-zinc-900">
                  {WEEKDAYS.map((w, i) => (
                    <label key={w} className="flex items-center gap-0.5">
                      <input
                        type="checkbox"
                        name={`wd${i + 1}`}
                        defaultChecked={plan ? plan.orderWeekdays.includes(i + 1) : true}
                      />
                      {w}
                    </label>
                  ))}
                </span>
              </fieldset>
            </ActionForm>
            {plan ? (
              <div>
                <h3 className="mb-1 text-sm text-zinc-600">
                  預設份數（每天依此產生訂單，客戶可再修改）
                </h3>
                <DefaultsEditor
                  key={`${plan.unitPrice}`}
                  siteId={s.id}
                  slot={slot}
                  defaultPrice={plan.unitPrice}
                  prices={prices}
                  lines={normalizeLines(
                    defaults
                      .filter((d) => d.slot === slot)
                      .map(({ kind, unitPrice, quantity, label }) => ({ kind, unitPrice, quantity, label })),
                  )}
                />
              </div>
            ) : (
              <p className="text-sm text-zinc-500">
                勾選「訂{SLOT_LABEL[slot]}」並儲存後，即可設定預設份數。
              </p>
            )}
          </section>
        );
      })}

      <section className="space-y-3 rounded-lg border border-slate-200 p-4">
        <div>
          <h2 className="font-medium">LINE 聯絡人</h2>
          <p className="text-sm text-ink-muted">
            新增聯絡人後把綁定碼交給客戶，客戶加 LINE 好友並傳送綁定碼即可用 LINE 訂餐。綁定碼 24 小時內有效。
          </p>
        </div>
        {contacts.length > 0 && (
          <table className={tableClass}>
            <thead>
              <tr>
                <th>聯絡人</th>
                <th>狀態</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>
                    {c.bound ? (
                      <span className="text-[#0ca30c]">
                        已綁定{c.displayName ? `（LINE：${c.displayName}）` : ""}
                        {c.boundAt && <span className="ml-1 text-xs text-ink-muted">{formatTime(c.boundAt)}</span>}
                      </span>
                    ) : c.bindCode && !c.expired ? (
                      <span>
                        綁定碼 <span className="font-mono text-base font-semibold tracking-widest">{c.bindCode}</span>
                        <span className="ml-1 text-xs text-ink-muted">{formatTime(c.expiresAt!)} 前有效</span>
                      </span>
                    ) : (
                      <span className="text-ink-muted">未綁定，綁定碼已過期</span>
                    )}
                  </td>
                  <td>
                    <span className="flex flex-wrap justify-end gap-2">
                      {c.bound ? (
                        <ActionForm
                          action={unbindLineContact.bind(null, c.id)}
                          submitLabel="解除綁定"
                          confirm={`確定解除 ${c.name} 的 LINE 綁定？`}
                          subtle
                          quiet
                        />
                      ) : (
                        <ActionForm action={renewBindCode.bind(null, c.id)} submitLabel="重新產生綁定碼" subtle quiet />
                      )}
                      <ActionForm
                        action={deleteLineContact.bind(null, c.id)}
                        submitLabel="刪除"
                        confirm={`確定刪除聯絡人 ${c.name}？`}
                        danger
                        quiet
                      />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <ActionForm
          action={addLineContact.bind(null, s.id)}
          submitLabel="新增聯絡人"
          resetOnSuccess
          className="flex flex-wrap items-end gap-3"
        >
          <label className={labelClass}>
            聯絡人姓名
            <input name="name" required maxLength={30} className={`${inputClass} w-36`} />
          </label>
        </ActionForm>
      </section>
    </div>
  );
}

function formatTime(at: Date) {
  return at.toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
