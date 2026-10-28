// The LINE bot conversation: binding, natural-language orders with a
// confirmation card, queries. See docs/spec.md (第二期). The AI only parses
// (src/lib/line/parse.ts); this file resolves the meal, prices and cutoffs,
// and every order write goes through src/lib/orders.ts.
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, lineContacts, lineDrafts, siteMealPlans, sites } from "@/db/schema";
import {
  KIND_LABEL,
  MEAL_SLOTS,
  SLOT_LABEL,
  addDays,
  cutoffFor,
  formatCutoff,
  isIsoDate,
  isoWeekday,
  taipeiDate,
  type MealSlot,
} from "../meals";
import {
  customerCutoffError,
  ensureDailyOrders,
  getOrderLines,
  isServiceDay,
  normalizeLines,
  placeCustomerOrder,
  sameLines,
  type OrderKey,
  type OrderLine,
} from "../orders";
import { getDisplayName, reply, text, type LineMessage } from "./api";
import { parseRequest, type ParsedRequest } from "./parse";

// The subset of webhook events the bot handles.
export type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
  message?: { type: string; text?: string };
  postback?: { data: string };
};

const MAX_MESSAGE = 200;
const MAX_QUANTITY = 999;
const DRAFT_MINUTES = 30;
const LOOKAHEAD_DAYS = 14;
const WEEKDAY = ["", "一", "二", "三", "四", "五", "六", "日"];

const HELP =
  "請直接傳訊息訂餐，例如：\n・明天午餐葷 12、素 3\n・今天素的改成 0\n・週五取消\n・今天訂了什麼？\n沒講日期時，會幫你訂下一個還沒截止的餐次。";

type Contact = { id: number; siteId: number; siteLabel: string };

export async function handleEvent(event: LineEvent) {
  const userId = event.source?.type === "user" ? event.source.userId : undefined;
  const token = event.replyToken;
  if (!userId || !token) return;

  const contact = await findContact(userId);
  const answer = (messages: LineMessage[]) => reply(token, messages);

  if (event.type === "follow") {
    return answer([
      text(
        contact
          ? `歡迎回來！你是 ${contact.siteLabel} 的訂餐聯絡人。\n\n${HELP}`
          : "歡迎使用訂餐服務！請輸入我們提供的 6 位數綁定碼，完成綁定後就能用 LINE 訂餐。",
      ),
    ]);
  }
  if (event.type === "postback" && contact && event.postback) {
    return answer(await handlePostback(contact, event.postback.data));
  }
  if (event.type !== "message") return;

  const body = event.message?.type === "text" ? (event.message.text ?? "").trim() : "";
  if (!contact) {
    return answer([text(/^\d{6}$/.test(body) ? await bind(userId, body) : "請先輸入 6 位數綁定碼完成綁定。")]);
  }
  if (!body) return answer([text(HELP)]);
  if (body.length > MAX_MESSAGE) return answer([text("訊息太長了，請簡短說明要訂的內容。")]);
  return answer(await handleText(contact, body));
}

async function findContact(userId: string): Promise<Contact | null> {
  const [row] = await db
    .select({
      id: lineContacts.id,
      siteId: lineContacts.siteId,
      siteName: sites.name,
      companyName: companies.name,
    })
    .from(lineContacts)
    .innerJoin(sites, eq(sites.id, lineContacts.siteId))
    .innerJoin(companies, eq(companies.id, sites.companyId))
    .where(and(eq(lineContacts.lineUserId, userId), eq(sites.active, true)));
  return row ? { id: row.id, siteId: row.siteId, siteLabel: `${row.companyName}${row.siteName}` } : null;
}

async function bind(userId: string, code: string): Promise<string> {
  const displayName = await getDisplayName(userId);
  const [bound] = await db
    .update(lineContacts)
    .set({
      lineUserId: userId,
      displayName,
      boundAt: sql`now()`,
      bindCode: null,
      bindCodeExpiresAt: null,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(lineContacts.bindCode, code),
        gt(lineContacts.bindCodeExpiresAt, sql`now()`),
        isNull(lineContacts.lineUserId),
      ),
    )
    .returning({ siteId: lineContacts.siteId });
  if (!bound) return "綁定碼不正確或已過期，請向我們索取新的綁定碼。";
  const contact = await findContact(userId);
  return `綁定完成！你是 ${contact?.siteLabel ?? ""} 的訂餐聯絡人。\n\n${HELP}`;
}

async function handleText(contact: Contact, body: string): Promise<LineMessage[]> {
  const now = new Date();
  const today = taipeiDate(now);
  let parsed: ParsedRequest | null;
  try {
    parsed = await parseRequest(body, {
      date: today,
      weekday: `星期${WEEKDAY[isoWeekday(today)]}`,
      time: now.toLocaleTimeString("zh-TW", { timeZone: "Asia/Taipei", hour12: false, hour: "2-digit", minute: "2-digit" }),
    });
  } catch (err) {
    console.error("[line] parse failed", err);
    return [text("系統忙碌中，請稍後再試，或來電由專人處理。")];
  }
  if (!parsed || parsed.intent === "unclear" || (parsed.intent === "order" && parsed.lines.length === 0)) {
    return [text(`抱歉，我看不太懂，可以換個說法嗎？\n\n${HELP}`)];
  }

  const target = await resolveMeal(contact.siteId, parsed, now);
  if ("error" in target) return [text(target.error)];
  const { key, planPrice, defaulted } = target;

  await ensureDailyOrders(key.date, key.slot);
  const before = await getOrderLines(key);

  if (parsed.intent === "query") {
    return [text(`${mealTitle(key)} 目前訂單：\n${describe(before)}\n\n${cutoffNote(key)}`)];
  }

  const after = parsed.intent === "cancel" ? [] : applyLines(before, parsed.lines, planPrice);
  if (after.some((l) => l.quantity > MAX_QUANTITY)) {
    return [text(`份數最多 ${MAX_QUANTITY} 份，請確認數量。`)];
  }
  if (sameLines(after, before)) {
    return [text(`${mealTitle(key)} 的訂單已經是這樣了，不用修改：\n${describe(before)}`)];
  }
  const closed = customerCutoffError(key, before, after, now);
  if (closed) return [text(closed)];

  const draftId = await db.transaction(async (tx) => {
    // Only the newest card can be confirmed.
    await tx
      .update(lineDrafts)
      .set({ status: "superseded" })
      .where(and(eq(lineDrafts.contactId, contact.id), eq(lineDrafts.status, "pending")));
    const [draft] = await tx
      .insert(lineDrafts)
      .values({ contactId: contact.id, siteId: key.siteId, date: key.date, slot: key.slot, before, lines: after, message: body })
      .returning({ id: lineDrafts.id });
    return draft.id;
  });
  return [confirmCard(draftId, contact.siteLabel, key, before, after, defaulted)];
}

type Meal = { key: OrderKey; planPrice: number; defaulted: boolean };

// The meal a message is about. Without a date or slot it is the next meal
// whose regular cutoff hasn't passed, among the site's planned meals.
async function resolveMeal(siteId: number, parsed: ParsedRequest, now: Date): Promise<Meal | { error: string }> {
  const today = taipeiDate(now);
  if (parsed.date !== null && (!isIsoDate(parsed.date) || parsed.date < today)) {
    return { error: "日期已經過了，請確認要訂哪一天。" };
  }
  if (parsed.date && parsed.date > addDays(today, LOOKAHEAD_DAYS)) {
    return { error: `目前只能訂 ${LOOKAHEAD_DAYS} 天內的餐。` };
  }
  const plans = await db
    .select({ slot: siteMealPlans.slot, unitPrice: siteMealPlans.unitPrice, weekdays: siteMealPlans.orderWeekdays })
    .from(siteMealPlans)
    .where(eq(siteMealPlans.siteId, siteId));
  if (parsed.slot && !plans.some((p) => p.slot === parsed.slot)) {
    return { error: `你們沒有訂${SLOT_LABEL[parsed.slot]}，如需加訂請來電。` };
  }

  const candidates: { date: string; slot: MealSlot; planPrice: number }[] = [];
  for (let d = 0; d <= LOOKAHEAD_DAYS; d++) {
    const date = addDays(today, d);
    if (parsed.date && date !== parsed.date) continue;
    if (!(await isServiceDay(date))) continue;
    for (const slot of MEAL_SLOTS) {
      const plan = plans.find((p) => p.slot === slot);
      if (!plan || !plan.weekdays.includes(isoWeekday(date))) continue;
      if (parsed.slot && slot !== parsed.slot) continue;
      candidates.push({ date, slot, planPrice: plan.unitPrice });
    }
    if (parsed.date) break;
  }
  if (candidates.length === 0) {
    return { error: parsed.date ? `${dayLabel(parsed.date)} 沒有供餐或不在你們的訂餐日。` : "近期沒有可以訂的餐次。" };
  }
  // A named date and slot is taken as is, even past cutoff (the cutoff
  // message explains). Otherwise skip meals already closed.
  const open = candidates.find((c) => now < cutoffFor(c.date, c.slot, "meat_a"));
  const pick = parsed.date && parsed.slot ? candidates[0] : (open ?? candidates[0]);
  return {
    key: { siteId, date: pick.date, slot: pick.slot },
    planPrice: pick.planPrice,
    defaulted: !parsed.date || !parsed.slot,
  };
}

// Quantities are "set to": each mentioned line replaces the matching one.
// Without a price, a kind with a single existing line keeps that line's price.
function applyLines(current: OrderLine[], wanted: ParsedRequest["lines"], planPrice: number): OrderLine[] {
  const next = current.map((l) => ({ ...l }));
  for (const w of wanted) {
    const label = w.kind === "other" ? (w.label ?? "").trim() : "";
    const same = next.filter((l) => l.kind === w.kind && (l.label ?? "") === label);
    const target =
      w.unit_price !== null
        ? same.find((l) => l.unitPrice === w.unit_price)
        : same.length === 1
          ? same[0]
          : same.find((l) => l.unitPrice === planPrice);
    const quantity = Math.max(0, w.quantity);
    if (target) target.quantity = quantity;
    else next.push({ kind: w.kind, unitPrice: w.unit_price ?? planPrice, quantity, label });
  }
  return normalizeLines(next);
}

async function handlePostback(contact: Contact, data: string): Promise<LineMessage[]> {
  const match = /^(confirm|cancel):(\d+)$/.exec(data);
  if (!match) return [];
  const [, action, id] = match;

  // Claiming the draft first makes a double tap harmless.
  const [draft] = await db
    .update(lineDrafts)
    .set({ status: action === "confirm" ? "confirmed" : "cancelled" })
    .where(
      and(
        eq(lineDrafts.id, Number(id)),
        eq(lineDrafts.contactId, contact.id),
        eq(lineDrafts.status, "pending"),
        gt(lineDrafts.createdAt, sql`now() - make_interval(mins => ${DRAFT_MINUTES})`),
      ),
    )
    .returning();
  if (!draft) {
    return [text("這張確認卡已失效（已處理、已有較新的內容，或超過 30 分鐘），請以最新的訊息為準。")];
  }
  const key: OrderKey = { siteId: draft.siteId, date: draft.date, slot: draft.slot };
  if (action === "cancel") return [text("已取消，訂單維持不變。")];

  const release = () => db.update(lineDrafts).set({ status: "cancelled" }).where(eq(lineDrafts.id, draft.id));
  const current = await getOrderLines(key);
  if (!sameLines(current, draft.before as OrderLine[])) {
    await release();
    return [text("訂單在這段時間有其他變動，請重新傳一次要訂的內容。")];
  }
  const result = await placeCustomerOrder(key, draft.lines as OrderLine[], "line", new Date(), contact.id);
  if (!result.ok) {
    await release();
    return [text(result.error)];
  }
  return [text(`已確認 ✓\n${mealTitle(key)}\n${describe(draft.lines as OrderLine[])}`)];
}

function dayLabel(date: string) {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}（${WEEKDAY[isoWeekday(date)]}）`;
}

const mealTitle = (key: OrderKey) => `${dayLabel(key.date)}${SLOT_LABEL[key.slot]}`;

function itemLabel(l: OrderLine) {
  return l.kind === "other" ? `${KIND_LABEL.other}：${l.label}` : KIND_LABEL[l.kind];
}

function describe(lines: OrderLine[]) {
  if (lines.length === 0) return "（沒有訂餐）";
  const total = lines.reduce((n, l) => n + l.quantity, 0);
  return `${lines.map((l) => `${itemLabel(l)} ${l.unitPrice}元 × ${l.quantity}`).join("\n")}\n共 ${total} 份`;
}

function cutoffNote(key: OrderKey) {
  return `截止：${formatCutoff(cutoffFor(key.date, key.slot, "meat_a"))}（B餐 ${formatCutoff(cutoffFor(key.date, key.slot, "b"))}）`;
}

const row = (left: string, right: string, color = "#0f172a") => ({
  type: "box",
  layout: "horizontal",
  contents: [
    { type: "text", text: left, size: "sm", color, flex: 5, wrap: true },
    { type: "text", text: right, size: "sm", color, flex: 3, align: "end" },
  ],
});

// Each line shows old → new; untouched lines are grey.
function confirmCard(
  draftId: number,
  siteLabel: string,
  key: OrderKey,
  before: OrderLine[],
  after: OrderLine[],
  defaulted: boolean,
): LineMessage {
  const id = (l: OrderLine) => `${l.kind}:${l.unitPrice}:${l.label ?? ""}`;
  const keys = [...new Set([...before, ...after].map(id))];
  const qty = (lines: OrderLine[], k: string) => lines.find((l) => id(l) === k)?.quantity ?? 0;
  const rows = keys.map((k) => {
    const line = [...after, ...before].find((l) => id(l) === k)!;
    const was = qty(before, k);
    const now = qty(after, k);
    return was === now
      ? row(`${itemLabel(line)} ${line.unitPrice}元`, `${now}`, "#94a3b8")
      : row(`${itemLabel(line)} ${line.unitPrice}元`, `${was} → ${now}`);
  });
  const total = after.reduce((n, l) => n + l.quantity, 0);

  return {
    type: "flex",
    altText: `請確認 ${mealTitle(key)} 訂單，共 ${total} 份`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#3f51b5",
        contents: [
          { type: "text", text: "請確認訂單", color: "#ffffff", weight: "bold", size: "md" },
          { type: "text", text: siteLabel, color: "#e8eaf6", size: "xs", wrap: true },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "text", text: mealTitle(key), weight: "bold", size: "lg" },
          ...(defaulted
            ? [{ type: "text", text: "未指定日期或餐次，已帶入下一個可訂的餐次", size: "xs", color: "#b45309", wrap: true }]
            : []),
          { type: "separator", margin: "md" },
          ...rows,
          { type: "separator", margin: "md" },
          row("合計", `${total} 份`),
          { type: "text", text: cutoffNote(key), size: "xxs", color: "#64748b", wrap: true, margin: "md" },
        ],
      },
      footer: {
        type: "box",
        layout: "horizontal",
        spacing: "md",
        contents: [
          { type: "button", style: "secondary", action: { type: "postback", label: "取消", data: `cancel:${draftId}`, displayText: "取消" } },
          { type: "button", style: "primary", color: "#3f51b5", action: { type: "postback", label: "確認", data: `confirm:${draftId}`, displayText: "確認" } },
        ],
      },
    },
  };
}
