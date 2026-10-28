// Push to a site's bound LINE contacts when staff change its order after
// cutoff (phone-in changes), the only push the bot sends. See docs/spec.md.
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { lineContacts } from "@/db/schema";
import { KIND_LABEL, SLOT_LABEL, isoWeekday } from "../meals";
import type { OrderKey, OrderLine } from "../orders";
import { push, text } from "./api";

const WEEKDAY = ["", "一", "二", "三", "四", "五", "六", "日"];

const describe = (lines: OrderLine[]) =>
  lines.length === 0
    ? "（已取消，沒有訂餐）"
    : lines
        .map((l) => `${l.kind === "other" ? `其它：${l.label}` : KIND_LABEL[l.kind]} ${l.unitPrice}元 × ${l.quantity}`)
        .join("\n");

export async function notifyStaffChange(key: OrderKey, after: OrderLine[]) {
  const contacts = await db
    .select({ userId: lineContacts.lineUserId })
    .from(lineContacts)
    .where(and(eq(lineContacts.siteId, key.siteId), isNotNull(lineContacts.lineUserId)));
  if (contacts.length === 0) return;

  const [, m, d] = key.date.split("-").map(Number);
  const message = text(
    `您 ${m}/${d}（${WEEKDAY[isoWeekday(key.date)]}）${SLOT_LABEL[key.slot]}的訂單已由專人調整為：\n${describe(after)}\n\n如有疑問請來電。`,
  );
  for (const { userId } of contacts) {
    try {
      await push(userId!, [message]);
    } catch (err) {
      console.error("[line] push failed", err);
    }
  }
}
