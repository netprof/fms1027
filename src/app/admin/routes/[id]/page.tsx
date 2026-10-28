import { and, asc, eq, gte } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { inputClass, labelClass, tableClass } from "@/components/styles";
import { db } from "@/db";
import {
  companies,
  employees,
  routeDriverOverrides,
  routes,
  siteMealPlans,
  sites,
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { SLOT_LABEL, isoWeekday, taipeiDate } from "@/lib/meals";
import { AdminPage } from "../../admin-page";
import { addOverride, deleteOverride, moveSite } from "../actions";
import { DriverSelect } from "../driver-select";

export const metadata: Metadata = { title: "路線設定" };

const WEEKDAY = ["", "一", "二", "三", "四", "五", "六", "日"];

export default function RoutePage({ params }: PageProps<"/admin/routes/[id]">) {
  return (
    <AdminPage>
      <Content params={params} />
    </AdminPage>
  );
}

async function Content({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const routeId = Number((await params).id);
  if (!Number.isInteger(routeId)) notFound();
  const [route] = await db
    .select({ route: routes, driver: employees.name })
    .from(routes)
    .leftJoin(employees, eq(employees.id, routes.defaultDriverId))
    .where(eq(routes.id, routeId));
  if (!route) notFound();

  const [stops, people] = await Promise.all([
    db
      .select({
        siteId: sites.id,
        siteName: sites.name,
        companyName: companies.name,
        active: sites.active,
        unitPrice: siteMealPlans.unitPrice,
      })
      .from(siteMealPlans)
      .innerJoin(sites, eq(sites.id, siteMealPlans.siteId))
      .innerJoin(companies, eq(companies.id, sites.companyId))
      .where(eq(siteMealPlans.routeId, routeId))
      .orderBy(asc(siteMealPlans.routeSeq), asc(sites.id)),
    db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(eq(employees.active, true))
      .orderBy(asc(employees.id)),
  ]);
  const today = taipeiDate();
  const overrides = await db
    .select({ date: routeDriverOverrides.date, driver: employees.name })
    .from(routeDriverOverrides)
    .innerJoin(employees, eq(employees.id, routeDriverOverrides.driverId))
    .where(and(eq(routeDriverOverrides.routeId, routeId), gte(routeDriverOverrides.date, today)))
    .orderBy(asc(routeDriverOverrides.date));

  const r = route.route;
  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold">
        {r.name}
        <span className="ml-2 text-sm font-normal text-zinc-500">
          {SLOT_LABEL[r.slot]}・預設司機 {route.driver ?? "未指派"}
        </span>
      </h2>

      <section className="space-y-3">
        <h3 className="font-medium">代班</h3>
        <ActionForm action={addOverride.bind(null, r.id)} submitLabel="設定代班" resetOnSuccess className="flex flex-wrap items-end gap-3">
          <label className={labelClass}>
            日期
            <input type="date" name="date" min={today} required className={inputClass} />
          </label>
          <label className={labelClass}>
            代班司機
            <DriverSelect people={people} required />
          </label>
        </ActionForm>
        {overrides.length === 0 ? (
          <p className="text-sm text-zinc-500">近期沒有代班。</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {overrides.map((o) => (
              <li key={o.date} className="flex items-center gap-3">
                <span className="tabular-nums">
                  {o.date}（{WEEKDAY[isoWeekday(o.date)]}）
                </span>
                <span>{o.driver}</span>
                <ActionForm action={deleteOverride.bind(null, r.id, o.date)} submitLabel="取消" danger quiet />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="font-medium">配送順序（{stops.length} 個廠區）</h3>
        <p className="text-sm text-zinc-500">
          儀表板依此順序由上往下列出。要把廠區移到別條路線，請到該廠區的設定頁。
        </p>
        <table className={tableClass}>
          <tbody>
            {stops.map((s, i) => (
              <tr key={s.siteId} className={s.active ? "" : "opacity-50"}>
                <td className="w-10 tabular-nums text-zinc-500">{i + 1}</td>
                <td>
                  <Link href={`/admin/sites/${s.siteId}`} className="text-primary hover:underline">
                    {s.companyName} {s.siteName}
                  </Link>
                </td>
                <td className="tabular-nums text-zinc-600">{s.unitPrice} 元</td>
                <td className="w-28">
                  <span className="flex gap-1">
                    {i > 0 && (
                      <ActionForm action={moveSite.bind(null, r.id, s.siteId, -1)} submitLabel="↑" subtle quiet />
                    )}
                    {i < stops.length - 1 && (
                      <ActionForm action={moveSite.bind(null, r.id, s.siteId, 1)} submitLabel="↓" subtle quiet />
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
