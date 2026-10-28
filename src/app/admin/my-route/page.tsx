import { asc, eq } from "drizzle-orm";
import { MapPin, Phone, RefreshCw } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { KindIcon } from "@/components/kind-icon";
import { priceColor } from "@/components/price-colors";
import { inputClass, labelClass, primaryButtonClass } from "@/components/styles";
import { db } from "@/db";
import { employees } from "@/db/schema";
import { requireEmployee } from "@/lib/auth";
import { getBoard, type BoardLine, type BoardRoute } from "@/lib/board";
import {
  MEAL_KINDS,
  MEAL_SLOTS,
  SLOT_LABEL,
  isIsoDate,
  isoWeekday,
  lineLabel,
  taipeiDate,
  type MealSlot,
} from "@/lib/meals";
import { ensureDailyOrders, type OrderLine } from "@/lib/orders";
import { AdminPage } from "../admin-page";

export const metadata: Metadata = { title: "我的路線" };

const WEEKDAY = ["", "一", "二", "三", "四", "五", "六", "日"];

export default function MyRoutePage({ searchParams }: PageProps<"/admin/my-route">) {
  return (
    <AdminPage title="我的路線" note="依配送順序列出今天要送的廠區與份數。藍色標示的是截止後由後台調整過的項目。">
      <Content searchParams={searchParams} />
    </AdminPage>
  );
}

const sum = (lines: OrderLine[]) => lines.reduce((n, l) => n + l.quantity, 0);
const signed = (n: number) => (n > 0 ? `+${n}` : `−${-n}`);

// Changed after a cutoff by staff: the driver must notice these.
const lateChange = (l: BoardLine) => l.staffAfterCutoff || !!l.change?.afterCutoff;

function Chip({ line, tiers }: { line: BoardLine; tiers: number[] }) {
  const late = lateChange(line);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm ${
        late ? "bg-sky-100 ring-1 ring-sky-400" : "bg-slate-50"
      } ${line.quantity === 0 ? "line-through" : ""}`}
    >
      <KindIcon kind={line.kind} color={priceColor(tiers, line.unitPrice)} size={15} />
      <span className="text-ink-muted">{lineLabel(line)}</span>
      <span className="font-semibold tabular-nums">{line.quantity}</span>
      {!tiers.includes(line.unitPrice) && (
        <span className="text-xs text-ink-muted">@{line.unitPrice}</span>
      )}
      {late && line.change && (
        <span className="text-xs font-medium text-sky-700">({signed(line.change.delta)})</span>
      )}
    </span>
  );
}

function RouteCard({
  slot,
  route,
  tiers,
}: {
  slot: MealSlot;
  route: BoardRoute;
  tiers: number[];
}) {
  const lines = route.sites.flatMap((s) => s.lines);
  // Totals by kind and price for loading the van.
  const totals = new Map<string, OrderLine>();
  for (const l of lines) {
    const key = `${l.kind}:${l.unitPrice}:${l.label ?? ""}`;
    const t = totals.get(key) ?? { ...l, quantity: 0 };
    t.quantity += l.quantity;
    totals.set(key, t);
  }
  const lateSites = route.sites.filter(
    (s) => s.lines.some(lateChange) || s.removed.some(lateChange),
  ).length;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-slate-200 pb-2">
        <h2 className="text-lg font-semibold">
          {SLOT_LABEL[slot]}・{route.name}
        </h2>
        {route.standIn && (
          <span className="rounded bg-amber-200 px-1.5 text-xs">代班</span>
        )}
        <span className="text-sm text-ink-muted">
          {route.sites.length} 個廠區・共 <b className="text-ink">{sum(lines)}</b> 份
        </span>
        {lateSites > 0 && (
          <span className="rounded bg-sky-100 px-1.5 text-xs text-sky-800">
            {lateSites} 個廠區截止後有調整
          </span>
        )}
      </div>

      {/* One row per price, highest first: also the colour legend. */}
      <div className="space-y-1">
        {[...new Set([...totals.values()].map((t) => t.unitPrice))]
          .sort((a, b) => b - a)
          .map((price) => (
            <div key={price} className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex w-16 items-center gap-1 text-sm text-ink-muted">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: priceColor(tiers, price) }}
                />
                {price} 元
              </span>
              {[...totals.values()]
                .filter((t) => t.unitPrice === price)
                .sort((a, b) => MEAL_KINDS.indexOf(a.kind) - MEAL_KINDS.indexOf(b.kind))
                .map((t) => (
                  <Chip
                    key={`${t.kind}:${t.unitPrice}:${t.label ?? ""}`}
                    line={{ ...t, change: null, staffAfterCutoff: false }}
                    tiers={tiers}
                  />
                ))}
            </div>
          ))}
      </div>

      <ol className="space-y-2">
        {route.sites.map((site, i) => {
          // Lines deleted after cutoff stay listed (struck through) so the
          // driver doesn't drop them off by habit.
          const shown = [...site.lines, ...site.removed.filter(lateChange)];
          return (
            <li key={site.siteId} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-baseline gap-2">
                <span className="w-6 shrink-0 text-right text-sm tabular-nums text-ink-muted">
                  {i + 1}
                </span>
                <span className="font-medium">
                  {site.companyName} {site.name}
                </span>
                <span className="ml-auto text-sm tabular-nums text-ink-muted">
                  {sum(site.lines)} 份
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5 pl-8">
                {shown.length === 0 ? (
                  <span className="text-sm text-ink-muted">今天沒有訂單</span>
                ) : (
                  shown.map((l) => (
                    <Chip
                      key={`${l.kind}:${l.unitPrice}:${l.label ?? ""}:${l.quantity === 0 ? "x" : ""}`}
                      line={l}
                      tiers={tiers}
                    />
                  ))
                )}
              </div>
              {(site.address || site.contactPhone) && (
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 pl-8 text-sm">
                  {site.address && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <MapPin size={14} aria-hidden />
                      {site.address}
                    </a>
                  )}
                  {site.contactPhone && (
                    <a
                      href={`tel:${site.contactPhone.replace(/[^\d+]/g, "")}`}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <Phone size={14} aria-hidden />
                      {site.contactName} {site.contactPhone}
                    </a>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

async function Content({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await requireEmployee();
  const params = await searchParams;
  const date = typeof params.date === "string" && isIsoDate(params.date) ? params.date : taipeiDate();
  // Admins may look at any driver's route; everyone else sees their own.
  const asked = Number(params.driver);
  const driverId = me.role === "admin" && Number.isInteger(asked) && asked > 0 ? asked : me.id;

  const [people, boards] = await Promise.all([
    me.role === "admin"
      ? db
          .select({ id: employees.id, name: employees.name })
          .from(employees)
          .where(eq(employees.active, true))
          .orderBy(asc(employees.id))
      : Promise.resolve([]),
    Promise.all(
      MEAL_SLOTS.map(async (slot) => {
        await ensureDailyOrders(date, slot);
        return getBoard(date, slot);
      }),
    ),
  ]);

  const mine = boards.flatMap((board) =>
    board.routes
      .filter((r) => r.driverId === driverId)
      .map((route) => ({ slot: board.slot, route, tiers: board.priceTiers })),
  );
  const serviceDay = boards[0].serviceDay;
  const query = (d: string) =>
    `/admin/my-route?date=${d}${driverId !== me.id ? `&driver=${driverId}` : ""}`;

  return (
    <div className="space-y-6">
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className={labelClass}>
          日期
          <input type="date" name="date" defaultValue={date} className={inputClass} />
        </label>
        {me.role === "admin" && (
          <label className={labelClass}>
            司機
            <select name="driver" defaultValue={driverId} className={inputClass}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="submit" className={primaryButtonClass}>
          查看
        </button>
        <Link
          href={query(date)}
          prefetch={false}
          className="inline-flex items-center gap-1 pb-1.5 text-sm text-primary hover:underline"
        >
          <RefreshCw size={14} aria-hidden />
          重新整理
        </Link>
      </form>

      <p className="text-sm text-ink-muted">
        {date}（{WEEKDAY[isoWeekday(date)]}）
      </p>

      {!serviceDay ? (
        <p className="text-ink-muted">當天不供餐。</p>
      ) : mine.length === 0 ? (
        <p className="text-ink-muted">這天沒有排到你的路線。</p>
      ) : (
        mine.map(({ slot, route, tiers }) => (
          <RouteCard key={`${slot}:${route.routeId}`} slot={slot} route={route} tiers={tiers} />
        ))
      )}
    </div>
  );
}
