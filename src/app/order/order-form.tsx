"use client";

import { useEffect, useState, useTransition } from "react";
import { MenuCard } from "@/components/menu-card";
import {
  QuantityEditor,
  editorFromLines,
  linesFromEditor,
  type EditorState,
} from "@/components/quantity-editor";
import { MEAL_KINDS, SLOT_LABEL, type MealSlot } from "@/lib/meals";
import type { OrderView } from "@/lib/order-view";
import { loadOrder, submitOrder } from "./actions";

export type SiteOption = { id: number; label: string; slots: MealSlot[] };

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
  const [loaded, setLoaded] = useState<OrderView | null>(null);
  const [editor, setEditor] = useState<EditorState>(() => editorFromLines([]));
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
      setEditor(editorFromLines(result.lines));
      setMessage(null);
    });
    return () => {
      cancelled = true;
    };
  }, [siteId, date, slot, takesSlot]);

  const allClosed =
    !loaded ||
    MEAL_KINDS.every((k) => now >= new Date(loaded.cutoffs[k]).getTime());

  function submit() {
    const parsed = linesFromEditor(editor);
    if ("error" in parsed) {
      setMessage({ ok: false, text: parsed.error });
      return;
    }
    startTransition(async () => {
      const result = await submitOrder(siteId, date, slot, parsed.lines);
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
          <MenuCard menu={loaded.menu} />
          <QuantityEditor
            state={editor}
            onChange={setEditor}
            defaultPrice={loaded.unitPrice}
            prices={prices}
            orderPrices={loaded.lines.map((l) => l.unitPrice)}
            cutoffs={loaded.cutoffs}
            now={now}
            lockClosed
          />
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
