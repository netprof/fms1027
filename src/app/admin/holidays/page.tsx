import { desc } from "drizzle-orm";
import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { inputClass, labelClass, tableClass } from "@/components/styles";
import { db } from "@/db";
import { holidays } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { isoWeekday } from "@/lib/meals";
import { AdminPage } from "../admin-page";
import { addHoliday, deleteHoliday } from "./actions";

export const metadata: Metadata = { title: "休假日" };

const WEEKDAY = ["", "一", "二", "三", "四", "五", "六", "日"];

export default function HolidaysPage() {
  return (
    <AdminPage
      title="休假日"
      note="週日固定不供餐；這裡設定其他停供日。停供日不會產生預設訂單，客戶也無法下單。"
    >
      <Content />
    </AdminPage>
  );
}

async function Content() {
  await requireAdmin();
  const rows = await db.select().from(holidays).orderBy(desc(holidays.date));

  return (
    <div className="space-y-6">
      <ActionForm action={addHoliday} submitLabel="新增" resetOnSuccess className="flex flex-wrap items-end gap-3">
        <label className={labelClass}>
          日期
          <input type="date" name="date" required className={inputClass} />
        </label>
        <label className={labelClass}>
          說明
          <input name="note" maxLength={50} placeholder="例如：國慶日" className={inputClass} />
        </label>
      </ActionForm>

      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">尚未設定休假日。</p>
      ) : (
        <table className={tableClass}>
          <thead>
            <tr>
              <th>日期</th>
              <th>說明</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.date}>
                <td className="tabular-nums">
                  {h.date}（{WEEKDAY[isoWeekday(h.date)]}）
                </td>
                <td>{h.note}</td>
                <td className="text-right">
                  <ActionForm
                    action={deleteHoliday.bind(null, h.date)}
                    submitLabel="刪除"
                    confirm={`刪除 ${h.date}？`}
                    danger
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
