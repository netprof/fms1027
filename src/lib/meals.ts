// Meal slots, kinds and order cutoffs. Safe to import from client components.
// Times are Asia/Taipei; Taiwan has no DST, so a fixed +08:00 offset is exact.

export const MEAL_SLOTS = ["lunch", "dinner"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

// meat_a / veg_a / no_pork / no_beef follow the daily menu; b is the
// pre-ordered B meal; other carries a free-text label on the order line.
export const MEAL_KINDS = [
  "meat_a",
  "veg_a",
  "no_pork",
  "no_beef",
  "b",
  "other",
] as const;
export type MealKind = (typeof MEAL_KINDS)[number];

export const SLOT_LABEL: Record<MealSlot, string> = {
  lunch: "午餐",
  dinner: "晚餐",
};

export const KIND_LABEL: Record<MealKind, string> = {
  meat_a: "葷",
  veg_a: "素",
  no_pork: "無豬",
  no_beef: "無牛",
  b: "B餐",
  other: "其它",
};

export function lineLabel(line: { kind: MealKind; label?: string }): string {
  return line.kind === "other" && line.label ? line.label : KIND_LABEL[line.kind];
}

// B meals close the day before; every other kind closes on the day itself.
const A_CUTOFF_HOUR: Record<MealSlot, number> = { lunch: 11, dinner: 16 };
const B_CUTOFF_HOUR = 16;

export function isMealSlot(value: unknown): value is MealSlot {
  return MEAL_SLOTS.includes(value as MealSlot);
}

export function isMealKind(value: unknown): value is MealKind {
  return MEAL_KINDS.includes(value as MealKind);
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function taipeiDate(at: Date = new Date()): string {
  return new Date(at.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}

export function taipeiTime(date: string, hour: number): Date {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:00:00+08:00`);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// 1 = Monday … 7 = Sunday.
export function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function cutoffFor(date: string, slot: MealSlot, kind: MealKind): Date {
  return kind === "b"
    ? taipeiTime(addDays(date, -1), B_CUTOFF_HOUR)
    : taipeiTime(date, A_CUTOFF_HOUR[slot]);
}

// The slot staff most likely care about right now: lunch until the lunch
// cutoff has passed by a few hours, then dinner.
export function currentSlot(at: Date = new Date()): MealSlot {
  return at < taipeiTime(taipeiDate(at), 14) ? "lunch" : "dinner";
}

export function formatCutoff(at: Date): string {
  return at.toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
