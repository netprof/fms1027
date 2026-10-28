"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { priceTiers } from "@/db/schema";
import { adminAction, id, integer } from "@/lib/admin-form";

const sides = (fd: FormData) =>
  integer(fd, "sideDishCount", "配菜道數", { min: 0, max: 6 });

export async function addTier(fd: FormData) {
  return adminAction(async () => {
    await db.insert(priceTiers).values({
      price: integer(fd, "price", "價位", { min: 1, max: 9999 }),
      sideDishCount: sides(fd),
    });
    return "已新增";
  });
}

export async function updateTier(price: number, fd: FormData) {
  return adminAction(async () => {
    await db
      .update(priceTiers)
      .set({ sideDishCount: sides(fd) })
      .where(eq(priceTiers.price, id(price)));
  });
}

// Fails with a message while a site still uses the price (foreign key).
export async function deleteTier(price: number) {
  return adminAction(async () => {
    await db.delete(priceTiers).where(eq(priceTiers.price, id(price)));
    return "已刪除";
  });
}
