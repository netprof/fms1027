"use server";

import { randomInt } from "node:crypto";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { lineContacts } from "@/db/schema";
import { FormError, adminAction, id, text } from "@/lib/admin-form";

const CODE_HOURS = 24;

// A fresh 6-digit code valid for 24 hours. Expired codes are released first
// so the unique index only holds live ones; a clash is retried.
async function issueCode(contactId: number) {
  await db
    .update(lineContacts)
    .set({ bindCode: null, bindCodeExpiresAt: null })
    .where(lt(lineContacts.bindCodeExpiresAt, sql`now()`));
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    try {
      const [row] = await db
        .update(lineContacts)
        .set({
          bindCode: code,
          bindCodeExpiresAt: sql`now() + make_interval(hours => ${CODE_HOURS})`,
          updatedAt: sql`now()`,
        })
        .where(and(eq(lineContacts.id, contactId), isNull(lineContacts.lineUserId)))
        .returning({ id: lineContacts.id });
      if (!row) throw new FormError("此聯絡人已綁定，請先解除綁定");
      return code;
    } catch (err) {
      if ((err as { cause?: { code?: string } }).cause?.code !== "23505") throw err;
    }
  }
  throw new FormError("產生綁定碼失敗，請再試一次");
}

export async function addLineContact(siteId: number, fd: FormData) {
  return adminAction(async () => {
    const [contact] = await db
      .insert(lineContacts)
      .values({ siteId: id(siteId), name: text(fd, "name", "聯絡人姓名", { max: 30 }) })
      .returning({ id: lineContacts.id });
    const code = await issueCode(contact.id);
    return `已新增，綁定碼 ${code}`;
  });
}

export async function renewBindCode(contactId: number) {
  return adminAction(async () => `新綁定碼 ${await issueCode(id(contactId))}`);
}

export async function unbindLineContact(contactId: number) {
  return adminAction(async () => {
    await db
      .update(lineContacts)
      .set({ lineUserId: null, displayName: null, boundAt: null, updatedAt: sql`now()` })
      .where(eq(lineContacts.id, id(contactId)));
    return "已解除綁定";
  });
}

export async function deleteLineContact(contactId: number) {
  return adminAction(async () => {
    await db.delete(lineContacts).where(eq(lineContacts.id, id(contactId)));
    return "已刪除";
  });
}
