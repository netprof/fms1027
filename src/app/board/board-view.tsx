"use client";

import { useCallback, useEffect, useState } from "react";
import type { Board, BoardSite } from "@/lib/board";
import {
  KIND_LABEL,
  MEAL_KINDS,
  SLOT_LABEL,
  currentSlot,
  taipeiDate,
  type MealSlot,
} from "@/lib/meals";
import type { OrderLine } from "@/lib/orders";

const HIGHLIGHT_MS = 10 * 60_000;

type Selection = { date: string; slot: MealSlot } | null; // null = follow now

const STYLE = {
  new: "bg-green-200 ring-2 ring-green-500",
  modified: "bg-orange-200 ring-2 ring-orange-500",
  cancelled: "bg-red-200 ring-2 ring-red-500 line-through",
  staff: "bg-sky-200 ring-2 ring-sky-500",
} as const;

function siteStyle(site: BoardSite, now: number): string {
  const change = site.lastChange;
  if (change?.afterCutoff) return STYLE.staff;
  if (change && now - new Date(change.at).getTime() < HIGHLIGHT_MS) {
    return STYLE[change.kind];
  }
  return site.staffAfterCutoff ? STYLE.staff : "";
}

const sum = (lines: OrderLine[]) => lines.reduce((n, l) => n + l.quantity, 0);

// "葷20 素3" — prices shown only when they differ from the site's own price.
function LineSummary({ site }: { site: BoardSite }) {
  if (site.lines.length === 0) return <span className="text-zinc-400">—</span>;
  return (
    <span className="flex flex-wrap justify-end gap-x-2">
      {site.lines.map((l) => (
        <span key={`${l.kind}:${l.unitPrice}`}>
          <span className="text-zinc-500">{KIND_LABEL[l.kind]}</span>
          <span className="font-semibold tabular-nums">{l.quantity}</span>
          {l.unitPrice !== site.unitPrice && (
            <span className="text-xs text-zinc-500">@{l.unitPrice}</span>
          )}
        </span>
      ))}
    </span>
  );
}

function Totals({ lines }: { lines: OrderLine[] }) {
  const byKey = new Map<string, OrderLine>();
  for (const l of lines) {
    const key = `${l.kind}:${l.unitPrice}`;
    const t = byKey.get(key) ?? { ...l, quantity: 0 };
    t.quantity += l.quantity;
    byKey.set(key, t);
  }
  const rows = [...byKey.values()].sort(
    (a, b) =>
      MEAL_KINDS.indexOf(a.kind) - MEAL_KINDS.indexOf(b.kind) ||
      b.unitPrice - a.unitPrice,
  );
  return (
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
      {rows.map((l) => (
        <span key={`${l.kind}:${l.unitPrice}`}>
          {KIND_LABEL[l.kind]} {l.unitPrice} 元{" "}
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
        <span className="ml-auto flex items-center gap-3 text-xs">
          <Legend className={STYLE.new} label="新下單" />
          <Legend className={STYLE.modified} label="修改" />
          <Legend className={STYLE.cancelled} label="取消" />
          <Legend className={STYLE.staff} label="截止後後台調整" />
          <span className={live ? "text-green-400" : "text-red-400"}>
            ● {live ? "即時" : "連線中斷"}
          </span>
        </span>
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
                        className={`rounded px-1.5 py-1 text-sm ${siteStyle(site, serverNow)}`}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-medium">
                            {site.companyName}
                            <span className="text-zinc-600">{site.name}</span>
                          </span>
                          <LineSummary site={site} />
                        </div>
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
            <Totals lines={allLines} />
          </footer>
        </>
      )}
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`inline-block h-3 w-3 rounded-sm ${className}`} />
      {label}
    </span>
  );
}
