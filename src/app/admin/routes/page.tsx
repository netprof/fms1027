import { asc, count, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { inputClass, labelClass, tableClass } from "@/components/styles";
import { db } from "@/db";
import { employees, routes, siteMealPlans } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { MEAL_SLOTS, SLOT_LABEL } from "@/lib/meals";
import { AdminPage } from "../admin-page";
import { createRoute, updateRoute } from "./actions";
import { DriverSelect } from "./driver-select";

export const metadata: Metadata = { title: "路線" };

export default function RoutesPage() {
  return (
    <AdminPage
      title="路線"
      note="午餐與晚餐的路線分開設定。排序決定儀表板上的欄位順序；點路線名稱調整廠區配送順序與代班。"
    >
      <Content />
    </AdminPage>
  );
}

async function Content() {
  await requireAdmin();
  const [routeRows, people] = await Promise.all([
    db
      .select({
        route: routes,
        siteCount: count(siteMealPlans.siteId),
      })
      .from(routes)
      .leftJoin(siteMealPlans, eq(siteMealPlans.routeId, routes.id))
      .groupBy(routes.id)
      .orderBy(asc(routes.sortOrder), asc(routes.id)),
    db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(eq(employees.active, true))
      .orderBy(asc(employees.id)),
  ]);

  return (
    <div className="space-y-10">
      {MEAL_SLOTS.map((slot) => {
        const rows = routeRows.filter((r) => r.route.slot === slot);
        return (
          <section key={slot} className="space-y-3">
            <h2 className="text-lg font-medium">{SLOT_LABEL[slot]}路線</h2>
            <table className={tableClass}>
              <thead>
                <tr>
                  <th>路線</th>
                  <th>廠區數</th>
                  <th>設定</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ route, siteCount }) => (
                  <tr key={route.id} className={route.active ? "" : "opacity-50"}>
                    <td>
                      <Link href={`/admin/routes/${route.id}`} className="text-primary hover:underline">
                        {route.name}
                      </Link>
                    </td>
                    <td className="tabular-nums">{siteCount}</td>
                    <td>
                      <ActionForm action={updateRoute.bind(null, route.id)} className="flex flex-wrap items-end gap-3">
                        <label className={labelClass}>
                          名稱
                          <input name="name" required maxLength={30} defaultValue={route.name} className={`${inputClass} w-32`} />
                        </label>
                        <label className={labelClass}>
                          預設司機
                          <DriverSelect people={people} value={route.defaultDriverId} />
                        </label>
                        <label className={labelClass}>
                          排序
                          <input name="sortOrder" type="number" min={0} max={999} defaultValue={route.sortOrder} className={`${inputClass} w-16`} />
                        </label>
                        <label className="flex items-center gap-1 pb-1 text-sm">
                          <input type="checkbox" name="active" defaultChecked={route.active} />
                          啟用
                        </label>
                      </ActionForm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ActionForm
              action={createRoute.bind(null, slot)}
              submitLabel={`新增${SLOT_LABEL[slot]}路線`}
              resetOnSuccess
              className="flex flex-wrap items-end gap-3"
            >
              <label className={labelClass}>
                名稱
                <input name="name" required maxLength={30} className={`${inputClass} w-32`} />
              </label>
              <label className={labelClass}>
                預設司機
                <DriverSelect people={people} />
              </label>
              <label className={labelClass}>
                排序
                <input name="sortOrder" type="number" min={0} max={999} defaultValue={rows.length} className={`${inputClass} w-16`} />
              </label>
            </ActionForm>
          </section>
        );
      })}
    </div>
  );
}
