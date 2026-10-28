"use client";

import { useCallback, useEffect, useState } from "react";
import type { Board, BoardLine, BoardSite, RecentChange } from "@/lib/board";
import { describeChange, lineKey } from "@/lib/changes";
import {
  KIND_LABEL,
  MEAL_KINDS,
  SLOT_LABEL,
  currentSlot,
  lineLabel,
  taipeiDate,
  type MealKind,
  type MealSlot,
} from "@/lib/meals";
import type { OrderLine } from "@/lib/orders";
import { KindIcon } from "./kind-icon";

const HIGHLIGHT_MS = 10 * 60_000;

type Selection = { date: string; slot: MealSlot } | null; // null = follow now

// Change states are tints of the status palette behind one line's icon and
// quantity; cancelled is also struck through so it never relies on colour.
type Status = "new" | "modified" | "cancelled" | "staff";
// solid marks the recent-changes list.
const STATUS: Record<
  Status,
  { label: string; tint: string; solid: string; className?: string }
> = {
  new: { label: "新下單", tint: "rgba(12,163,12,0.22)", solid: "#0ca30c" },
  modified: { label: "修改", tint: "rgba(250,178,25,0.38)", solid: "#fab219" },
  cancelled: {
    label: "取消",
    tint: "rgba(208,59,59,0.22)",
    solid: "#d03b3b",
    className: "line-through",
  },
  staff: { label: "截止後後台調整", tint: "rgba(42,120,214,0.22)", solid: "#2a78d6" },
};

const SOURCE_LABEL: Record<RecentChange["source"], string> = {
  customer_web: "客戶",
  line: "LINE",
  staff: "後台",
};

// Price tiers take categorical slots in fixed order, highest price first.
// The first three are validated all-pairs for colour-vision deficiency.
const TIER_COLORS = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#6250d6",
  "#e34948",
];
const CUSTOM_PRICE_COLOR = "#6b6a65";

type Prices = {
  tiers: number[];
  isTier: (price: number) => boolean;
  color: (price: number) => string;
};

function lineStatus(line: BoardLine, now: number): Status | null {
  const change = line.change;
  if (change?.afterCutoff) return "staff";
  if (change && now - new Date(change.at).getTime() < HIGHLIGHT_MS) {
    return change.kind;
  }
  return line.staffAfterCutoff ? "staff" : null;
}

const sum = (lines: OrderLine[]) => lines.reduce((n, l) => n + l.quantity, 0);

function LineChip({
  line,
  prices,
  status,
}: {
  line: OrderLine;
  prices: Prices;
  status: Status | null;
}) {
  const style = status ? STATUS[status] : null;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded px-1 ${style?.className ?? ""}`}
      style={style ? { background: style.tint } : undefined}
      title={`${lineLabel(line)} ${line.unitPrice} 元${style ? `（${style.label}）` : ""}`}
    >
      <KindIcon kind={line.kind} color={prices.color(line.unitPrice)} size={14} />
      {line.kind === "other" && line.label && (
        <span className="text-[11px] text-zinc-600">{line.label}</span>
      )}
      <span className="font-semibold tabular-nums">{line.quantity}</span>
      {!prices.isTier(line.unitPrice) && (
        <span className="text-[11px] text-zinc-500">@{line.unitPrice}</span>
      )}
    </span>
  );
}

function SiteLines({
  site,
  now,
  prices,
}: {
  site: BoardSite;
  now: number;
  prices: Prices;
}) {
  // Cancelled lines stay visible while they are highlighted.
  const shown = [
    ...site.lines.map((line) => ({ line, removed: false })),
    ...site.removed.map((line) => ({ line, removed: true })),
  ]
    .map((x) => ({ ...x, status: lineStatus(x.line, now) }))
    .filter((x) => !x.removed || x.status);
  if (shown.length === 0) return <span className="text-zinc-400">—</span>;
  return (
    <span className="flex flex-wrap justify-end gap-x-0.5">
      {shown.map(({ line, removed, status }) => (
        <LineChip
          key={lineKey(line) + (removed ? ":removed" : "")}
          line={line}
          prices={prices}
          status={status}
        />
      ))}
    </span>
  );
}

// Quantities by price (rows) and meal kind (columns). The full table under
// the board lists every kind and tier, so it doubles as the legend.
function QuantityTable({
  lines,
  prices,
  full = false,
}: {
  lines: OrderLine[];
  prices: Prices;
  full?: boolean;
}) {
  // Every table shows every tier and kind so route tables line up. Only the
  // full table splits custom prices into one row each and "其它" into one
  // column per free-text label; route tables lump them together.
  const CUSTOM = -1;
  const rowOf = (l: OrderLine) =>
    full || prices.isTier(l.unitPrice) ? l.unitPrice : CUSTOM;
  const colOf = (l: OrderLine) =>
    full && l.kind === "other" && l.label ? `other:${l.label}` : l.kind;

  const usedCols = new Set(lines.map(colOf));
  const customPrices = full
    ? [...new Set(lines.map((l) => l.unitPrice))]
        .filter((p) => !prices.isTier(p))
        .sort((a, b) => b - a)
    : [];
  // With no custom prices in use, the full table keeps an empty 其它價位
  // row so it still works as the legend.
  const rows = [
    ...prices.tiers,
    ...(customPrices.length > 0 ? customPrices : [CUSTOM]),
  ];
  const otherCols = [...usedCols].filter((c) => c.startsWith("other:")).sort();
  const cols = [
    ...MEAL_KINDS.filter((k) => k !== "other"),
    ...otherCols,
    ...(otherCols.length === 0 || usedCols.has("other") ? ["other"] : []),
  ];

  const cell = (r: number | null, c: string | null) =>
    sum(
      lines.filter(
        (l) => (r === null || rowOf(l) === r) && (c === null || colOf(l) === c),
      ),
    );
  const kindOf = (c: string) => c.split(":")[0] as MealKind;
  const colLabel = (c: string) =>
    c.startsWith("other:") ? c.slice(6) : KIND_LABEL[c as MealKind];

  const num = (n: number) =>
    n === 0 ? <span className="text-zinc-300">·</span> : n;
  const pad = full ? "px-2 py-0.5" : "px-1 py-px";

  return (
    <table className={`w-full tabular-nums ${full ? "text-sm" : "text-xs"}`}>
      <thead>
        <tr className="text-zinc-500">
          <th className={`${pad} text-left font-normal`}>
            {full ? "價位＼餐別" : ""}
          </th>
          {cols.map((c) => (
            <th key={c} className={`${pad} text-right font-normal`}>
              <span className="inline-flex items-center gap-1" title={colLabel(c)}>
                <KindIcon kind={kindOf(c)} size={full ? 16 : 13} />
                {full && <span>{colLabel(c)}</span>}
              </span>
            </th>
          ))}
          <th className={`${pad} text-right font-normal`}>計</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r} className="border-t border-zinc-200">
            <th className={`${pad} text-left font-normal text-zinc-600`}>
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: r === CUSTOM ? CUSTOM_PRICE_COLOR : prices.color(r) }}
                />
                {r === CUSTOM
                  ? "其它價位"
                  : prices.isTier(r)
                    ? `${r} 元`
                    : `${r} 元（其它）`}
              </span>
            </th>
            {cols.map((c) => (
              <td key={c} className={`${pad} text-right`}>
                {num(cell(r, c))}
              </td>
            ))}
            <td className={`${pad} text-right font-semibold`}>{num(cell(r, null))}</td>
          </tr>
        ))}
        <tr className="border-t-2 border-zinc-300 font-semibold">
          <th className={`${pad} text-left`}>計</th>
          {cols.map((c) => (
            <td key={c} className={`${pad} text-right`}>
              {num(cell(null, c))}
            </td>
          ))}
          <td className={`${pad} text-right ${full ? "text-lg" : "text-sm"}`}>
            {sum(lines)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

// Fills the space beside the total table; the list scrolls inside it.
function RecentChanges({ changes }: { changes: RecentChange[] }) {
  return (
    <section className="relative min-h-40 min-w-0 flex-1">
      <div className="absolute inset-0 flex flex-col">
        <h2 className="mb-1 text-sm text-zinc-500">近期異動</h2>
        {changes.length === 0 ? (
          <p className="text-sm text-zinc-400">尚無異動</p>
        ) : (
          <ol className="flex-1 overflow-y-auto text-sm">
            {changes.map((c) => {
              const status = STATUS[c.afterCutoff ? "staff" : c.kind];
              return (
                <li
                  key={c.id}
                  title={status.label}
                  className="flex items-baseline gap-2 border-b border-l-4 border-b-zinc-100 py-0.5 pl-2"
                  style={{ borderLeftColor: status.solid }}
                >
                  <span className="shrink-0 tabular-nums text-zinc-500">
                    {new Date(c.at).toLocaleTimeString("zh-TW", {
                      timeZone: "Asia/Taipei",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}
                  </span>
                  <span className="shrink-0 font-medium">{c.siteLabel}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {describeChange(c.before, c.after)}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {SOURCE_LABEL[c.source]}
                    {c.employeeName && `・${c.employeeName}`}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

export function BoardView() {
  const [selection, setSelection] = useState<Selection>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState(false);
  const [live, setLive] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  // Offset between this screen's clock and the server's.
  const [skew, setSkew] = useState(0);

  // Ticks every 15 s: expires highlights and, in follow mode, rolls the day/slot.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 15_000);
    return () => clearInterval(timer);
  }, []);

  const target = selection ??
    (now === null
      ? null
      : { date: taipeiDate(new Date(now)), slot: currentSlot(new Date(now)) });
  const targetDate = target?.date;
  const targetSlot = target?.slot;

  const load = useCallback(async () => {
    if (!targetDate || !targetSlot) return;
    try {
      const res = await fetch(`/api/board?date=${targetDate}&slot=${targetSlot}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as Board;
      setSkew(new Date(data.serverNow).getTime() - Date.now());
      setBoard(data);
      setError(false);
    } catch {
      setError(true);
    }
  }, [targetDate, targetSlot]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on target change
    load();
  }, [load]);

  // Refetch whenever an order for the shown day and slot changes.
  useEffect(() => {
    if (!targetDate || !targetSlot) return;
    const source = new EventSource("/api/board/events");
    source.onopen = () => {
      setLive(true);
      load(); // catch up on anything missed while disconnected
    };
    source.onerror = () => setLive(false);
    source.addEventListener("change", (e) => {
      const event = JSON.parse((e as MessageEvent).data);
      if (event.date === targetDate && event.slot === targetSlot) load();
    });
    return () => source.close();
  }, [targetDate, targetSlot, load]);

  const serverNow = (now ?? 0) + skew;
  const allLines = board?.routes.flatMap((r) => r.sites.flatMap((s) => s.lines)) ?? [];
  const tierList = board?.priceTiers ?? [];
  const prices: Prices = {
    tiers: tierList,
    isTier: (price) => tierList.includes(price),
    color: (price) => {
      const i = tierList.indexOf(price);
      return i < 0 ? CUSTOM_PRICE_COLOR : TIER_COLORS[i % TIER_COLORS.length];
    },
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-100 text-zinc-900">
      <header className="flex flex-wrap items-center gap-3 bg-zinc-900 px-4 py-2 text-white">
        <h1 className="text-xl font-semibold">訂餐儀表板</h1>
        <input
          type="date"
          aria-label="日期"
          className="rounded bg-zinc-800 px-2 py-1"
          value={targetDate ?? ""}
          onChange={(e) =>
            e.target.value &&
            setSelection({ date: e.target.value, slot: targetSlot ?? "lunch" })
          }
        />
        {(["lunch", "dinner"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() =>
              targetDate && setSelection({ date: targetDate, slot: s })
            }
            className={`rounded px-3 py-1 ${targetSlot === s ? "bg-white text-zinc-900" : "bg-zinc-800"}`}
          >
            {SLOT_LABEL[s]}
          </button>
        ))}
        {selection && (
          <button
            type="button"
            onClick={() => setSelection(null)}
            className="rounded bg-zinc-800 px-3 py-1 text-sm"
          >
            回到現在
          </button>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-3 text-xs">
          {(Object.keys(STATUS) as Status[]).map((s) => (
            <span
              key={s}
              className={`rounded px-1.5 py-0.5 text-zinc-900 ${STATUS[s].className ?? ""}`}
              // Tints are drawn over white so they read the same as on the board.
              style={{ background: `linear-gradient(${STATUS[s].tint}, ${STATUS[s].tint}), #fff` }}
            >
              {STATUS[s].label}
            </span>
          ))}
          <span className={live ? "text-green-400" : "text-red-400"}>
            ● {live ? "即時" : "連線中斷"}
          </span>
        </div>
      </header>

      {error && (
        <p className="bg-red-600 px-4 py-1 text-sm text-white">
          資料載入失敗，稍後自動重試。
        </p>
      )}

      {!board ? (
        <p className="p-8 text-zinc-500">載入中…</p>
      ) : !board.serviceDay ? (
        <p className="p-8 text-2xl text-zinc-500">{board.date} 不供餐</p>
      ) : (
        <>
          <main className="grid flex-1 auto-cols-[minmax(13rem,1fr)] grid-flow-col gap-2 overflow-x-auto p-2">
            {board.routes.map((route) => (
              <section
                key={route.routeId}
                className="flex flex-col rounded bg-white shadow-sm"
              >
                <div className="flex items-baseline gap-2 border-b border-zinc-200 px-2 py-1">
                  <span className="text-base font-semibold">
                    {route.driver?.name ?? "未指派"}
                  </span>
                  {route.standIn && (
                    <span className="rounded bg-amber-300 px-1 text-xs">代班</span>
                  )}
                  <span className="ml-auto text-xs tabular-nums text-zinc-500">
                    {route.driver?.phone}
                  </span>
                </div>
                <ol className="flex-1 px-1 py-0.5 text-[13px] leading-tight">
                  {route.sites.map((site) => (
                    <li
                      key={site.siteId}
                      className="flex items-start justify-between gap-1 border-b border-zinc-100 px-1 py-0.5 last:border-0"
                    >
                      <span className="shrink-0">
                        {site.companyName}
                        <span className="text-zinc-500">{site.name}</span>
                      </span>
                      <SiteLines site={site} now={serverNow} prices={prices} />
                    </li>
                  ))}
                </ol>
                <div className="border-t border-zinc-300 bg-zinc-50 px-1 py-0.5">
                  <QuantityTable
                    lines={route.sites.flatMap((s) => s.lines)}
                    prices={prices}
                  />
                </div>
              </section>
            ))}
          </main>
          <footer className="flex flex-col gap-6 bg-white px-4 py-2 shadow-inner lg:flex-row">
            <div className="w-full max-w-5xl shrink-0">
              <QuantityTable lines={allLines} prices={prices} full />
            </div>
            <RecentChanges changes={board.recentChanges} />
          </footer>
        </>
      )}
    </div>
  );
}
