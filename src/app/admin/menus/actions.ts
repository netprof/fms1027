"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { menus } from "@/db/schema";
import { FormError, adminAction, text } from "@/lib/admin-form";
import { SIDE_DISH_COUNT, isIsoDate, isMealSlot } from "@/lib/meals";

// Saves one day's menu for one slot. Clearing every field removes it.
export async function saveMenu(day: string, slot: string, fd: FormData) {
  return adminAction(async () => {
    if (!isIsoDate(day) || !isMealSlot(slot)) throw new FormError("資料不正確");
    const key = and(eq(menus.date, day), eq(menus.slot, slot));

    const sideDishes = Array.from({ length: SIDE_DISH_COUNT }, (_, i) =>
      text(fd, `side${i}`, `配菜 ${i + 1}`, { required: false, max: 30 }),
    ).filter(Boolean);
    const bMealItems = text(fd, "bMeal", "B 餐", { required: false, max: 100 })
      .split(/[、,，\s]+/)
      .filter(Boolean);
    const mainDish = text(fd, "mainDish", "主菜", { required: false, max: 30 });
    const soup = text(fd, "soup", "湯", { required: false, max: 30 });

    if (!mainDish && !soup && sideDishes.length === 0 && bMealItems.length === 0) {
      await db.delete(menus).where(key);
      return "已清除";
    }
    if (!mainDish) throw new FormError("請填寫主菜");
    if (!soup) throw new FormError("請填寫湯");

    await db
      .insert(menus)
      .values({ date: day, slot, mainDish, sideDishes, soup, bMealItems })
      .onConflictDoUpdate({
        target: [menus.date, menus.slot],
        set: { mainDish, sideDishes, soup, bMealItems },
      });
  });
}
