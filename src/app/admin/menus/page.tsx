import { and, gte, inArray, lte } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { inputClass } from "@/components/styles";
import { db } from "@/db";
import { holidays, menus } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import {
  MEAL_SLOTS,
  SIDE_DISH_COUNT,
  SLOT_LABEL,
  addDays,
  isIsoDate,
  isoWeekday,
  taipeiDate,
} from "@/lib/meals";
import { AdminPage } from "../admin-page";
import { saveMenu } from "./actions";

export const metadata: Metadata = { title: "菜單" };

const WEEKDAY = ["", "一", "二", "三", "四", "五", "六", "日"];

export default function MenusPage({ searchParams }: PageProps<"/admin/menus">) {
  return (
    <AdminPage
      wide
      title="菜單"
      note="每天一主菜、六配菜、一湯；B 餐品項以「、」分隔。整格清空後儲存即刪除該餐菜單。"
    >
      <Content searchParams={searchParams} />
    </AdminPage>
  );
}

async function Content({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const week = (await searchParams).week;
  const anchor = typeof week === "string" && isIsoDate(week) ? week : taipeiDate();
  const monday = addDays(anchor, 1 - isoWeekday(anchor));
  const days = Array.from({ length: 6 }, (_, i) => addDays(monday, i));

  const [rows, offDays] = await Promise.all([
    db.select().from(menus).where(and(gte(menus.date, days[0]), lte(menus.date, days[5]))),
    db.select().from(holidays).where(inArray(holidays.date, days)),
  ]);

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-4 text-sm">
        <Link href={`/admin/menus?week=${addDays(monday, -7)}`} className="text-primary hover:underline">
          ← 上一週
        </Link>
        <span className="font-medium tabular-nums">
          {days[0]} ～ {days[5]}
        </span>
        <Link href={`/admin/menus?week=${addDays(monday, 7)}`} className="text-primary hover:underline">
          下一週 →
        </Link>
        <Link href="/admin/menus" className="text-primary hover:underline">
          本週
        </Link>
      </nav>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {days.map((day) => {
          const off = offDays.find((h) => h.date === day);
          return (
            <section key={day} className={`rounded border p-3 ${off ? "border-zinc-200 bg-zinc-50" : "border-zinc-300"}`}>
              <h2 className="mb-2 font-medium tabular-nums">
                {day.slice(5)}（{WEEKDAY[isoWeekday(day)]}）
                {off && <span className="ml-2 text-sm text-red-600">休假{off.note ? `：${off.note}` : ""}</span>}
              </h2>
              <div className="space-y-4">
                {MEAL_SLOTS.map((slot) => {
                  const m = rows.find((r) => r.date === day && r.slot === slot);
                  return (
                    <ActionForm
                      key={`${slot}:${m ? "1" : "0"}`}
                      action={saveMenu.bind(null, day, slot)}
                      className="space-y-1"
                    >
                      <div className="text-xs text-zinc-500">{SLOT_LABEL[slot]}</div>
                      <div className="flex gap-1">
                        <input name="mainDish" placeholder="主菜" maxLength={30} defaultValue={m?.mainDish ?? ""} className={`${inputClass} w-1/2 font-medium`} />
                        <input name="soup" placeholder="湯" maxLength={30} defaultValue={m?.soup ?? ""} className={`${inputClass} w-1/2`} />
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {Array.from({ length: SIDE_DISH_COUNT }, (_, i) => (
                          <input
                            key={i}
                            name={`side${i}`}
                            placeholder={`配菜 ${i + 1}`}
                            maxLength={30}
                            defaultValue={m?.sideDishes[i] ?? ""}
                            className={inputClass}
                          />
                        ))}
                      </div>
                      <input
                        name="bMeal"
                        placeholder="B 餐（以、分隔，可留空）"
                        maxLength={100}
                        defaultValue={m?.bMealItems.join("、") ?? ""}
                        className={`${inputClass} mb-1 w-full`}
                      />
                    </ActionForm>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
