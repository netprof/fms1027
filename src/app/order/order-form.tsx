"use client";

import { useEffect, useState, useTransition } from "react";
import {
  KIND_LABEL,
  MEAL_KINDS,
  SLOT_LABEL,
  formatCutoff,
  type MealKind,
  type MealSlot,
} from "@/lib/meals";
import type { OrderLine } from "@/lib/orders";
import { loadOrder, submitOrder, type LoadedOrder } from "./actions";

export type SiteOption = { id: number; label: string; slots: MealSlot[] };

type Quantities = Record<string, number>; // `${kind}:${price}` → quantity

const cell = (kind: MealKind, price: number) => `${kind}:${price}`;

function toQuantities(lines: OrderLine[]): Quantities {
  return Object.fromEntries(
    lines.map((l) => [cell(l.kind, l.unitPrice), l.quantity]),
  );
}

export function OrderForm({
  sites,
  prices,
  initialDate,
  initialSlot,
}: {
  sites: SiteOption[];
  prices: number[];
  initialDate: string;
  initialSlot: MealSlot;
}) {
  const [siteId, setSiteId] = useState(sites[0]?.id ?? 0);
  const [date, setDate] = useState(initialDate);
  const [slot, setSlot] = useState<MealSlot>(initialSlot);
  const [loaded, setLoaded] = useState<LoadedOrder | null>(null);
  const [quantities, setQuantities] = useState<Quantities>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());

  const site = sites.find((s) => s.id === siteId);
  const takesSlot = site?.slots.includes(slot) ?? false;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!takesSlot) return;
    let cancelled = false;
    startTransition(async () => {
      const result = await loadOrder(siteId, date, slot);
      if (cancelled) return;
      if ("error" in result) {
        setLoaded(null);
        setMessage({ ok: false, text: result.error });
        return;
      }
      setLoaded(result);
      setQuantities(toQuantities(result.lines));
      setMessage(null);
    });
    return () => {
      cancelled = true;
    };
  }, [siteId, date, slot, takesSlot]);

  const closed = (kind: MealKind) =>
    !loaded || now >= new Date(loaded.cutoffs[kind]).getTime();
  const allClosed = MEAL_KINDS.every(closed);

  function submit() {
    const lines: OrderLine[] = Object.entries(quantities).map(([key, quantity]) => {
      const [kind, price] = key.split(":");
      return { kind: kind as MealKind, unitPrice: Number(price), quantity };
    });
    startTransition(async () => {
      const result = await submitOrder(siteId, date, slot, lines);
      if (!result.ok) {
        setMessage({ ok: false, text: result.error });
        return;
      }
      setMessage({
        ok: true,
        text: result.changed ? "已送出，儀表板會立即更新。" : "內容沒有變更。",
      });
    });
  }

  // Default price first, then the other tiers.
  const columns = loaded
    ? [loaded.unitPrice, ...prices.filter((p) => p !== loaded.unitPrice)]
    : [];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm sm:col-span-3">
          客戶廠區
          <select
            className="rounded border border-zinc-300 bg-transparent p-2 text-base"
            value={siteId}
            onChange={(e) => setSiteId(Number(e.target.value))}
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          日期
          <input
            type="date"
            className="rounded border border-zinc-300 bg-transparent p-2 text-base"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          餐次
          <select
            className="rounded border border-zinc-300 bg-transparent p-2 text-base"
            value={slot}
            onChange={(e) => setSlot(e.target.value as MealSlot)}
          >
            {(["lunch", "dinner"] as const).map((s) => (
              <option key={s} value={s}>
                {SLOT_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!takesSlot ? (
        <p className="text-zinc-500">此廠區沒有訂{SLOT_LABEL[slot]}。</p>
      ) : !loaded ? (
        <p className="text-zinc-500">{pending ? "載入中…" : ""}</p>
      ) : !loaded.serviceDay ? (
        <p className="text-zinc-500">當天不供餐。</p>
      ) : (
        <>
          {loaded.menu ? (
            <section className="rounded border border-zinc-200 p-4 text-sm">
              <p className="font-medium">
                主菜：{loaded.menu.mainDish}　湯：{loaded.menu.soup}
              </p>
              <p className="mt-1 text-zinc-600">
                配菜：{loaded.menu.sideDishes.join("、")}
              </p>
              {loaded.menu.bMealItems.length > 0 && (
                <p className="mt-1 text-zinc-600">
                  B 餐：{loaded.menu.bMealItems.join("、")}
                </p>
              )}
            </section>
          ) : (
            <p className="text-sm text-zinc-500">這天的菜單還沒公布。</p>
          )}

          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-500">
                <th className="py-2 font-normal">餐別</th>
                {columns.map((p) => (
                  <th key={p} className="py-2 font-normal">
                    {p} 元{p === loaded.unitPrice && "（預設）"}
                  </th>
                ))}
                <th className="py-2 font-normal">截止</th>
              </tr>
            </thead>
            <tbody>
              {MEAL_KINDS.map((kind) => (
                <tr key={kind} className="border-t border-zinc-200">
                  <td className="py-2 font-medium">{KIND_LABEL[kind]}</td>
                  {columns.map((p) => (
                    <td key={p} className="py-2 pr-2">
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        aria-label={`${KIND_LABEL[kind]} ${p} 元份數`}
                        className="w-20 rounded border border-zinc-300 bg-transparent p-1.5 disabled:opacity-40"
                        disabled={closed(kind)}
                        value={quantities[cell(kind, p)] ?? 0}
                        onChange={(e) =>
                          setQuantities((q) => ({
                            ...q,
                            [cell(kind, p)]: Math.max(
                              0,
                              Math.floor(Number(e.target.value) || 0),
                            ),
                          }))
                        }
                      />
                    </td>
                  ))}
                  <td
                    className={`py-2 text-xs ${closed(kind) ? "text-red-600" : "text-zinc-500"}`}
                  >
                    {formatCutoff(new Date(loaded.cutoffs[kind]))}
                    {closed(kind) && " 已截止"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={submit}
              disabled={pending || allClosed}
              className="rounded bg-zinc-900 px-5 py-2 text-white disabled:opacity-40"
            >
              {pending ? "處理中…" : "送出訂單"}
            </button>
            {allClosed && (
              <span className="text-sm text-red-600">
                已全部截止，請來電由專人調整。
              </span>
            )}
          </div>
        </>
      )}

      {message && (
        <p
          role="status"
          className={`text-sm ${message.ok ? "text-green-700" : "text-red-600"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
