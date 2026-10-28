"use client";

import { useCallback, useEffect, useState } from "react";
import type { Board, BoardLine, BoardSite } from "@/lib/board";
import {
  KIND_LABEL,
  MEAL_KINDS,
  SLOT_LABEL,
  currentSlot,
  lineLabel,
  taipeiDate,
  type MealSlot,
} from "@/lib/meals";
import type { OrderLine } from "@/lib/orders";
import { KindIcon } from "./kind-icon";

const HIGHLIGHT_MS = 10 * 60_000;

type Selection = { date: string; slot: MealSlot } | null; // null = follow now

// Change highlights go behind a single line's icon and quantity.
const STYLE = {
  new: "bg-green-300",
  modified: "bg-orange-300",
  cancelled: "bg-red-300 line-through",
  staff: "bg-sky-300",
} as const;

// Icon colours for price tiers, highest tier first. Kept clear of the
// highlight hues above. Prices outside the tiers are grey and spelled out.
const TIER_COLORS = ["#4338ca", "#a21caf", "#0f766e", "#92400e", "#334155"];
const CUSTOM_PRICE_COLOR = "#71717a";

type PriceColor = (price: number) => string;

function lineStyle(line: BoardLine, now: number): string | null {
  const change = line.change;
  if (change?.afterCutoff) return STYLE.staff;
  if (change && now - new Date(change.at).getTime() < HIGHLIGHT_MS) {
    return STYLE[change.kind];
  }
  return line.staffAfterCutoff ? STYLE.staff : null;
}

const sum = (lines: OrderLine[]) => lines.reduce((n, l) => n + l.quantity, 0);
const lineKey = (l: OrderLine) => `${l.kind}:${l.unitPrice}:${l.label ?? ""}`;

function LineChip({
  line,
  priceColor,
  isTier,
  className = "",
}: {
  line: OrderLine;
  priceColor: PriceColor;
  isTier: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded px-1 ${className}`}
      title={`${lineLabel(line)} ${line.unitPrice} 元`}
    >
      <KindIcon kind={line.kind} color={priceColor(line.unitPrice)} />
      {line.kind === "other" && line.label && (
        <span className="text-xs text-zinc-600">{line.label}</span>
      )}
      <span className="font-semibold tabular-nums">{line.quantity}</span>
      {!isTier && (
        <span className="text-xs text-zinc-500">@{line.unitPrice}</span>
      )}
    </span>
  );
}

function SiteLines({
  site,
  now,
  priceColor,
  tiers,
}: {
  site: BoardSite;
  now: number;
  priceColor: PriceColor;
  tiers: Set<number>;
}) {
  // Cancelled lines stay visible while they are highlighted.
  const shown = [
    ...site.lines.map((l) => ({ line: l, style: lineStyle(l, now) })),
    ...site.removed
      .map((l) => ({ line: l, style: lineStyle(l, now) }))
      .filter((x) => x.style),
  ];
  if (shown.length === 0) return <span className="text-zinc-400">—</span>;
  return (
    <span className="flex flex-wrap justify-end gap-x-1 gap-y-0.5">
      {shown.map(({ line, style }) => (
        <LineChip
          key={lineKey(line) + (site.lines.includes(line) ? "" : ":removed")}
          line={line}
          priceColor={priceColor}
          isTier={tiers.has(line.unitPrice)}
          className={style ?? ""}
        />
      ))}
    </span>
  );
}

function Legend({
  tiers,
  priceColor,
}: {
  tiers: number[];
  priceColor: PriceColor;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      {MEAL_KINDS.map((k) => (
        <span key={k} className="flex items-center gap-1">
          <KindIcon kind={k} color="#e4e4e7" />
          {KIND_LABEL[k]}
        </span>
      ))}
      <span className="text-zinc-500">|</span>
      {tiers.map((p) => (
        <span key={p} className="flex items-center gap-1">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ background: priceColor(p) }}
          />
          {p} 元
        </span>
      ))}
      <span className="flex items-center gap-1">
        <span
          className="inline-block h-3 w-3 rounded-full"
          style={{ background: CUSTOM_PRICE_COLOR }}
        />
        其它價位
      </span>
      <span className="text-zinc-500">|</span>
      <Swatch className={STYLE.new} label="新下單" />
      <Swatch className={STYLE.modified} label="修改" />
      <Swatch className={STYLE.cancelled} label="取消" />
      <Swatch className={STYLE.staff} label="截止後後台調整" />
    </div>
  );
}

function Totals({
  lines,
  priceColor,
  tiers,
}: {
  lines: OrderLine[];
  priceColor: PriceColor;
  tiers: Set<number>;
}) {
  const byKey = new Map<string, OrderLine>();
  for (const l of lines) {
    const t = byKey.get(lineKey(l)) ?? { ...l, quantity: 0 };
    t.quantity += l.quantity;
    byKey.set(lineKey(l), t);
  }
  const rows = [...byKey.values()].sort(
    (a, b) =>
      MEAL_KINDS.indexOf(a.kind) - MEAL_KINDS.indexOf(b.kind) ||
      b.unitPrice - a.unitPrice ||
      (a.label ?? "").localeCompare(b.label ?? ""),
  );
  return (
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
      {rows.map((l) => (
        <span key={lineKey(l)} className="flex items-center gap-1">
          <KindIcon
            kind={l.kind}
            color={priceColor(l.unitPrice)}
            className="h-5 w-5"
          />
          <span className="text-sm text-zinc-600">
            {lineLabel(l)}
            {tiers.has(l.unitPrice) ? "" : ` @${l.unitPrice}`}
          </span>
          <b className="text-xl tabular-nums">{l.quantity}</b>
        </span>
      ))}
      <span className="ml-auto">
        合計 <b className="text-2xl tabular-nums">{sum(lines)}</b> 份
      </span>
    </div>
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
  const tiers = new Set(tierList);
  const priceColor: PriceColor = (price) => {
    const i = tierList.indexOf(price);
    return i < 0 ? CUSTOM_PRICE_COLOR : TIER_COLORS[i % TIER_COLORS.length];
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
        <span
          className={`ml-auto text-xs ${live ? "text-green-400" : "text-red-400"}`}
        >
          ● {live ? "即時" : "連線中斷"}
        </span>
        <div className="w-full">
          <Legend tiers={tierList} priceColor={priceColor} />
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
          <main className="grid flex-1 auto-cols-[minmax(11rem,1fr)] grid-flow-col gap-2 overflow-x-auto p-2">
            {board.routes.map((route) => {
              const lines = route.sites.flatMap((s) => s.lines);
              return (
                <section
                  key={route.routeId}
                  className="flex flex-col rounded bg-white shadow-sm"
                >
                  <div className="border-b border-zinc-200 px-2 py-1.5">
                    <div className="text-lg font-semibold">
                      {route.driver?.name ?? "未指派"}
                      {route.standIn && (
                        <span className="ml-1 rounded bg-amber-300 px-1 text-xs">
                          代班
                        </span>
                      )}
                    </div>
                    <div className="text-xs tabular-nums text-zinc-500">
                      {route.driver?.phone}
                    </div>
                  </div>
                  <ol className="flex-1 space-y-1 p-1">
                    {route.sites.map((site) => (
                      <li
                        key={site.siteId}
                        className="flex items-start justify-between gap-2 rounded px-1.5 py-1 text-sm"
                      >
                        <span className="shrink-0 font-medium">
                          {site.companyName}
                          <span className="text-zinc-600">{site.name}</span>
                        </span>
                        <SiteLines
                          site={site}
                          now={serverNow}
                          priceColor={priceColor}
                          tiers={tiers}
                        />
                      </li>
                    ))}
                  </ol>
                  <div className="border-t border-zinc-200 px-2 py-1 text-right text-sm">
                    小計 <b className="text-lg tabular-nums">{sum(lines)}</b>
                  </div>
                </section>
              );
            })}
          </main>
          <footer className="bg-white px-4 py-2 shadow-inner">
            <Totals lines={allLines} priceColor={priceColor} tiers={tiers} />
          </footer>
        </>
      )}
    </div>
  );
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`inline-block h-3 w-3 rounded-sm ${className}`} />
      {label}
    </span>
  );
}
