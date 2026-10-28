// Excel reports: the daily kitchen/route sheet and the monthly statement.
// Billing always uses the unit-price snapshot on each order line.
import "server-only";
import ExcelJS from "exceljs";
import { and, asc, gte, lt, eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, orderLines, orders, sites } from "@/db/schema";
import { getBoard } from "./board";
import {
  KIND_LABEL,
  MEAL_KINDS,
  SLOT_LABEL,
  addDays,
  lineLabel,
  type MealKind,
  type MealSlot,
} from "./meals";
import { ensureDailyOrders, type OrderLine } from "./orders";

const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Every kind except "other" gets a column; "other" is a count plus its text.
const KIND_COLUMNS = MEAL_KINDS.filter((k) => k !== "other");

function styleHeader(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EAF6" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function boldRow(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
}

const qty = (lines: OrderLine[], kind?: MealKind) =>
  lines.filter((l) => !kind || l.kind === kind).reduce((n, l) => n + l.quantity, 0);

export async function dailySheet(date: string, slot: MealSlot) {
  await ensureDailyOrders(date, slot);
  const board = await getBoard(date, slot);

  const wb = new ExcelJS.Workbook();
  const routeSheet = wb.addWorksheet("出餐單");
  routeSheet.columns = [
    { header: "路線", key: "route", width: 14 },
    { header: "司機", key: "driver", width: 10 },
    { header: "序", key: "seq", width: 5 },
    { header: "客戶廠區", key: "site", width: 20 },
    { header: "單價", key: "price", width: 7 },
    ...KIND_COLUMNS.map((k) => ({ header: KIND_LABEL[k], key: k, width: 7 })),
    { header: "其它", key: "other", width: 7 },
    { header: "其它內容", key: "otherText", width: 16 },
    { header: "合計", key: "total", width: 8 },
  ];
  styleHeader(routeSheet);

  const kindCells = (lines: OrderLine[]) =>
    Object.fromEntries(KIND_COLUMNS.map((k) => [k, qty(lines, k) || null]));

  for (const route of board.routes) {
    const driver = route.driver ? `${route.driver.name}${route.standIn ? "（代）" : ""}` : "";
    const routeLines = route.sites.flatMap((s) => s.lines);
    for (const [i, site] of route.sites.entries()) {
      // One row per price on the order; sites with nothing ordered are left out.
      const prices = [...new Set(site.lines.map((l) => l.unitPrice))].sort((a, b) => b - a);
      for (const price of prices) {
        const lines = site.lines.filter((l) => l.unitPrice === price);
        const others = lines.filter((l) => l.kind === "other");
        routeSheet.addRow({
          route: route.name,
          driver,
          seq: i + 1,
          site: `${site.companyName} ${site.name}`,
          price,
          ...kindCells(lines),
          other: qty(others) || null,
          otherText: others.map((l) => `${l.label}×${l.quantity}`).join("、") || null,
          total: qty(lines),
        });
      }
    }
    boldRow(
      routeSheet.addRow({
        route: `${route.name} 小計`,
        driver,
        ...kindCells(routeLines),
        other: qty(routeLines, "other") || null,
        total: qty(routeLines),
      }),
    );
  }

  // Kitchen prep: totals by price and kind, custom labels spelled out.
  const prep = wb.addWorksheet("備料總計");
  prep.columns = [
    { header: "單價", key: "price", width: 8 },
    ...KIND_COLUMNS.map((k) => ({ header: KIND_LABEL[k], key: k, width: 8 })),
    { header: "其它", key: "other", width: 8 },
    { header: "其它內容", key: "otherText", width: 24 },
    { header: "合計", key: "total", width: 8 },
  ];
  styleHeader(prep);
  const all = board.routes.flatMap((r) => r.sites.flatMap((s) => s.lines));
  for (const price of [...new Set(all.map((l) => l.unitPrice))].sort((a, b) => b - a)) {
    const lines = all.filter((l) => l.unitPrice === price);
    const others = new Map<string, number>();
    for (const l of lines.filter((l) => l.kind === "other")) {
      others.set(l.label ?? "", (others.get(l.label ?? "") ?? 0) + l.quantity);
    }
    prep.addRow({
      price,
      ...kindCells(lines),
      other: qty(lines, "other") || null,
      otherText: [...others].map(([label, n]) => `${label}×${n}`).join("、") || null,
      total: qty(lines),
    });
  }
  boldRow(prep.addRow({ price: "合計", ...kindCells(all), other: qty(all, "other") || null, total: qty(all) }));

  return {
    filename: `出餐單_${date}_${SLOT_LABEL[slot]}.xlsx`,
    body: Buffer.from(await wb.xlsx.writeBuffer()),
    type: XLSX_TYPE,
  };
}

export type MonthlyRow = {
  companyName: string;
  siteName: string;
  date: string;
  slot: MealSlot;
  line: OrderLine;
};

// "2026-10" → every order line from 10/1 up to (not including) 11/1.
export async function monthlyLines(month: string): Promise<MonthlyRow[]> {
  const start = `${month}-01`;
  // 31 days after the 1st always lands in the next month.
  const end = `${addDays(start, 31).slice(0, 7)}-01`;
  const rows = await db
    .select({
      companyName: companies.name,
      siteName: sites.name,
      siteId: sites.id,
      date: orders.date,
      slot: orders.slot,
      kind: orderLines.kind,
      unitPrice: orderLines.unitPrice,
      quantity: orderLines.quantity,
      label: orderLines.label,
    })
    .from(orderLines)
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .innerJoin(sites, eq(sites.id, orders.siteId))
    .innerJoin(companies, eq(companies.id, sites.companyId))
    .where(and(gte(orders.date, start), lt(orders.date, end)))
    .orderBy(asc(companies.name), asc(sites.id), asc(orders.date), asc(orders.slot));
  return rows.map((r) => ({
    companyName: r.companyName,
    siteName: r.siteName,
    date: r.date,
    slot: r.slot,
    line: { kind: r.kind, unitPrice: r.unitPrice, quantity: r.quantity, label: r.label },
  }));
}

export type CompanyTotal = { companyName: string; quantity: number; amount: number };

export function companyTotals(rows: MonthlyRow[]): CompanyTotal[] {
  const totals = new Map<string, CompanyTotal>();
  for (const r of rows) {
    const t = totals.get(r.companyName) ?? { companyName: r.companyName, quantity: 0, amount: 0 };
    t.quantity += r.line.quantity;
    t.amount += r.line.quantity * r.line.unitPrice;
    totals.set(r.companyName, t);
  }
  return [...totals.values()];
}

export async function monthlyStatement(month: string) {
  const rows = await monthlyLines(month);
  const wb = new ExcelJS.Workbook();
  const money = "#,##0";

  const summary = wb.addWorksheet("公司彙總");
  summary.columns = [
    { header: "公司", key: "company", width: 20 },
    { header: "份數", key: "quantity", width: 10, style: { numFmt: money } },
    { header: "金額", key: "amount", width: 14, style: { numFmt: money } },
  ];
  styleHeader(summary);
  const totals = companyTotals(rows);
  for (const t of totals) summary.addRow({ company: t.companyName, quantity: t.quantity, amount: t.amount });
  boldRow(
    summary.addRow({
      company: "合計",
      quantity: totals.reduce((n, t) => n + t.quantity, 0),
      amount: totals.reduce((n, t) => n + t.amount, 0),
    }),
  );

  const bySite = wb.addWorksheet("廠區彙總");
  bySite.columns = [
    { header: "公司", key: "company", width: 20 },
    { header: "廠區", key: "site", width: 12 },
    { header: "份數", key: "quantity", width: 10, style: { numFmt: money } },
    { header: "金額", key: "amount", width: 14, style: { numFmt: money } },
  ];
  styleHeader(bySite);
  const sitesTotal = new Map<string, { company: string; site: string; quantity: number; amount: number }>();
  for (const r of rows) {
    const key = `${r.companyName}\u0000${r.siteName}`;
    const t = sitesTotal.get(key) ?? { company: r.companyName, site: r.siteName, quantity: 0, amount: 0 };
    t.quantity += r.line.quantity;
    t.amount += r.line.quantity * r.line.unitPrice;
    sitesTotal.set(key, t);
  }
  for (const t of sitesTotal.values()) bySite.addRow(t);

  const detail = wb.addWorksheet("明細");
  detail.columns = [
    { header: "公司", key: "company", width: 20 },
    { header: "廠區", key: "site", width: 12 },
    { header: "日期", key: "date", width: 12 },
    { header: "餐次", key: "slot", width: 6 },
    { header: "餐別", key: "kind", width: 12 },
    { header: "單價", key: "price", width: 8, style: { numFmt: money } },
    { header: "份數", key: "quantity", width: 8, style: { numFmt: money } },
    { header: "金額", key: "amount", width: 12, style: { numFmt: money } },
  ];
  styleHeader(detail);
  for (const r of rows) {
    detail.addRow({
      company: r.companyName,
      site: r.siteName,
      date: r.date,
      slot: SLOT_LABEL[r.slot],
      kind: lineLabel(r.line),
      price: r.line.unitPrice,
      quantity: r.line.quantity,
      amount: r.line.quantity * r.line.unitPrice,
    });
  }

  return {
    filename: `月結對帳表_${month}.xlsx`,
    body: Buffer.from(await wb.xlsx.writeBuffer()),
    type: XLSX_TYPE,
  };
}

export function isMonth(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}
