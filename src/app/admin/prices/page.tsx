import { desc } from "drizzle-orm";
import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { inputClass, labelClass, tableClass } from "@/components/styles";
import { db } from "@/db";
import { priceTiers } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { AdminPage } from "../admin-page";
import { addTier, deleteTier, updateTier } from "./actions";

export const metadata: Metadata = { title: "價位" };

export default function PricesPage() {
  return (
    <AdminPage
      title="價位"
      note="標準為一主菜、六配菜、一湯；較低價位少幾道配菜。價位依高到低在儀表板配色。仍有廠區使用的價位無法刪除。"
    >
      <Content />
    </AdminPage>
  );
}

async function Content() {
  await requireAdmin();
  const tiers = await db.select().from(priceTiers).orderBy(desc(priceTiers.price));

  return (
    <div className="space-y-6">
      <ActionForm action={addTier} submitLabel="新增價位" resetOnSuccess className="flex flex-wrap items-end gap-3">
        <label className={labelClass}>
          價位（元）
          <input name="price" type="number" min={1} max={9999} required className={`${inputClass} w-24`} />
        </label>
        <label className={labelClass}>
          配菜道數
          <input name="sideDishCount" type="number" min={0} max={6} required className={`${inputClass} w-20`} />
        </label>
      </ActionForm>

      <table className={tableClass}>
        <thead>
          <tr>
            <th>價位</th>
            <th>內容</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {tiers.map((t) => (
            <tr key={t.price}>
              <td className="font-medium tabular-nums">{t.price} 元</td>
              <td>
                <ActionForm action={updateTier.bind(null, t.price)} className="flex items-center gap-2">
                  <span>一主菜、</span>
                  <input
                    name="sideDishCount"
                    type="number"
                    min={0}
                    max={6}
                    defaultValue={t.sideDishCount}
                    className={`${inputClass} w-14`}
                  />
                  <span>配菜、一湯</span>
                </ActionForm>
              </td>
              <td className="text-right">
                <ActionForm
                  action={deleteTier.bind(null, t.price)}
                  submitLabel="刪除"
                  confirm={`刪除 ${t.price} 元價位？`}
                  danger
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
