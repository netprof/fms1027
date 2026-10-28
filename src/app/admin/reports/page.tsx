import { Download } from "lucide-react";
import type { Metadata } from "next";
import { inputClass, labelClass, primaryButtonClass, tableClass } from "@/components/styles";
import { requireEmployee } from "@/lib/auth";
import { SLOT_LABEL, currentSlot, taipeiDate } from "@/lib/meals";
import { companyTotals, isMonth, monthlyLines } from "@/lib/reports";
import { AdminPage } from "../admin-page";

export const metadata: Metadata = { title: "報表" };

export default function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  return (
    <AdminPage title="報表" note="匯出 Excel。月結對帳表以每筆訂單下單當時的單價計算。">
      <Content searchParams={searchParams} />
    </AdminPage>
  );
}

const fmt = (n: number) => n.toLocaleString("zh-TW");

async function Content({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await requireEmployee();
  const { month: asked } = await searchParams;
  const today = taipeiDate();
  const month = isMonth(asked) ? asked : today.slice(0, 7);
  const totals = me.role === "admin" ? companyTotals(await monthlyLines(month)) : [];

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="font-medium">每日出餐單</h2>
        <p className="text-sm text-ink-muted">
          依路線與配送順序列出各廠區份數（每個價位一列），並附廚房備料總計。
        </p>
        <form method="get" action="/api/reports/daily" className="flex flex-wrap items-end gap-3">
          <label className={labelClass}>
            日期
            <input type="date" name="date" required defaultValue={today} className={inputClass} />
          </label>
          <label className={labelClass}>
            餐次
            <select name="slot" defaultValue={currentSlot()} className={inputClass}>
              {(["lunch", "dinner"] as const).map((s) => (
                <option key={s} value={s}>
                  {SLOT_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={`${primaryButtonClass} inline-flex items-center gap-1.5`}>
            <Download size={15} aria-hidden />
            下載 Excel
          </button>
        </form>
      </section>

      {me.role === "admin" && (
        <section className="space-y-3">
          <h2 className="font-medium">月結對帳表</h2>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className={labelClass}>
              月份
              <input type="month" name="month" required defaultValue={month} className={inputClass} />
            </label>
            <button type="submit" className="rounded-md border border-slate-300 px-4 py-1.5 text-sm hover:border-primary hover:text-primary">
              預覽
            </button>
            <a
              href={`/api/reports/monthly?month=${month}`}
              className={`${primaryButtonClass} inline-flex items-center gap-1.5`}
            >
              <Download size={15} aria-hidden />
              下載 {month} Excel
            </a>
          </form>
          {totals.length === 0 ? (
            <p className="text-sm text-ink-muted">{month} 沒有訂單。</p>
          ) : (
            <table className={tableClass}>
              <thead>
                <tr>
                  <th>公司</th>
                  <th className="!text-right">份數</th>
                  <th className="!text-right">金額</th>
                </tr>
              </thead>
              <tbody>
                {totals.map((t) => (
                  <tr key={t.companyName}>
                    <td>{t.companyName}</td>
                    <td className="text-right tabular-nums">{fmt(t.quantity)}</td>
                    <td className="text-right tabular-nums">{fmt(t.amount)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td>合計</td>
                  <td className="text-right tabular-nums">
                    {fmt(totals.reduce((n, t) => n + t.quantity, 0))}
                  </td>
                  <td className="text-right tabular-nums">
                    {fmt(totals.reduce((n, t) => n + t.amount, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
          <p className="text-xs text-ink-muted">
            Excel 內含三個工作表：公司彙總、廠區彙總、逐日逐餐明細。
          </p>
        </section>
      )}
    </div>
  );
}
