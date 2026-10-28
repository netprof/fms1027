"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { holidays } from "@/db/schema";
import { FormError, adminAction, date, optionalText } from "@/lib/admin-form";
import { isIsoDate } from "@/lib/meals";

export async function addHoliday(fd: FormData) {
  return adminAction(async () => {
    await db.insert(holidays).values({
      date: date(fd, "date", "日期"),
      note: optionalText(fd, "note", "說明", 50),
    });
    return "已新增";
  });
}

export async function deleteHoliday(day: string) {
  return adminAction(async () => {
    if (!isIsoDate(day)) throw new FormError("日期不正確");
    await db.delete(holidays).where(eq(holidays.date, day));
    return "已刪除";
  });
}
