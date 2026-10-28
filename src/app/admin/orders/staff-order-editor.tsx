"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { MenuCard } from "@/components/menu-card";
import {
  QuantityEditor,
  editorFromLines,
  linesFromEditor,
  type EditorState,
} from "@/components/quantity-editor";
import { describeChange } from "@/lib/changes";
import { MEAL_KINDS, SLOT_LABEL, type MealSlot } from "@/lib/meals";
import {
  adjustOrder,
  loadStaffOrder,
  type HistoryEntry,
  type StaffOrderView,
} from "./actions";

export type StaffSite = {
  id: number;
  label: string;
  routes: Partial<Record<MealSlot, string>>;
};

const SOURCE_LABEL: Record<HistoryEntry["source"], string> = {
  system: "每日預設",
  customer_web: "客戶下單",
  line: "LINE",
  staff: "後台",
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function StaffOrderEditor({
  sites,
  prices,
  initialDate,
  initialSlot,
}: {
  sites: StaffSite[];
  prices: number[];
  initialDate: string;
  initialSlot: MealSlot;
}) {
  const [query, setQuery] = useState("");
  const [siteId, setSiteId] = useState(sites[0]?.id ?? 0);
  const [date, setDate] = useState(initialDate);
  const [slot, setSlot] = useState<MealSlot>(initialSlot);
  const [loaded, setLoaded] = useState<StaffOrderView | null>(null);
  const [editor, setEditor] = useState<EditorState>(() => editorFromLines([]));
  const [reason, setReason] = useState("客戶來電");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());

  const site = sites.find((s) => s.id === siteId);
  const takesSlot = !!site?.routes[slot];
  const filter = (text: string) => {
    const q = text.trim();
    return q
      ? sites.filter(
          (s) =>
            s.label.includes(q) ||
            Object.values(s.routes).some((r) => r?.includes(q)),
        )
      : sites;
  };
  const matches = filter(query);
  // Keep the selected site listed even when the filter hides it.
  const options = matches.some((s) => s.id === siteId) || !site
    ? matches
    : [site, ...matches];

  // Typing a search jumps to the first match unless the current site matches.
  function search(text: string) {
    setQuery(text);
    const next = filter(text);
    if (next.length > 0 && !next.some((s) => s.id === siteId)) {
      setSiteId(next[0].id);
    }
  }

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const reload = useCallback(
    (keepMessage = false) =>
      startTransition(async () => {
        const result = await loadStaffOrder(siteId, date, slot);
        if ("error" in result) {
          setLoaded(null);
          setMessage({ ok: false, text: result.error });
          return;
        }
        setLoaded(result);
        setEditor(editorFromLines(result.lines));
        if (!keepMessage) setMessage(null);
      }),
    [siteId, date, slot],
  );

  useEffect(() => {
    if (takesSlot) reload();
  }, [takesSlot, reload]);

  const pastCutoff =
    !!loaded &&
    MEAL_KINDS.some((k) => now >= new Date(loaded.cutoffs[k]).getTime());

  function submit() {
    const parsed = linesFromEditor(editor);
    if ("error" in parsed) {
      setMessage({ ok: false, text: parsed.error });
      return;
    }
    startTransition(async () => {
      const result = await adjustOrder(siteId, date, slot, parsed.lines, reason);
      if (!result.ok) {
        setMessage({ ok: false, text: result.error });
        return;
      }
      setMessage({
        ok: true,
        text: result.changed ? "已調整，儀表板會立即更新。" : "內容沒有變更。",
      });
      if (result.changed) reload(true);
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm sm:col-span-3">
            搜尋客戶或路線
            <input
              type="search"
              placeholder="例如：甲子、阿達"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              value={query}
              onChange={(e) => search(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-3">
            客戶廠區（{matches.length} 筆）
            <select
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              value={siteId}
              onChange={(e) => setSiteId(Number(e.target.value))}
            >
              {options.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}　{s.routes.lunch ?? ""}
                  {s.routes.dinner ? `／晚 ${s.routes.dinner}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            日期
            <input
              type="date"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            餐次
            <select
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
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
              lockClosed={false}
            />
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-1 flex-col gap-1 text-sm">
                調整原因
                <input
                  maxLength={100}
                  required
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                className="rounded-md bg-primary px-5 py-2 font-medium text-white shadow-sm hover:bg-primary-dark disabled:opacity-40"
              >
                {pending ? "處理中…" : "儲存調整"}
              </button>
            </div>
            {pastCutoff && (
              <p className="text-sm text-amber-700">
                底色標黃的餐別已過截止時間；調整後會記為「截止後後台調整」，儀表板顯示藍色。
              </p>
            )}
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

      <aside>
        <h2 className="mb-2 font-medium">異動紀錄</h2>
        {!loaded || loaded.history.length === 0 ? (
          <p className="text-sm text-zinc-500">沒有紀錄。</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {loaded.history.map((h) => (
              <li
                key={h.id}
                className={`rounded border p-2 ${h.afterCutoff ? "border-sky-300 bg-sky-50" : "border-zinc-200"}`}
              >
                <div className="flex justify-between text-xs text-zinc-500">
                  <span>
                    {SOURCE_LABEL[h.source]}
                    {h.employeeName && `・${h.employeeName}`}
                    {h.afterCutoff && "・截止後"}
                  </span>
                  <span className="tabular-nums">{formatTime(h.at)}</span>
                </div>
                <div className="mt-1">{describeChange(h.before, h.after)}</div>
                {h.reason && (
                  <div className="mt-0.5 text-xs text-zinc-600">原因：{h.reason}</div>
                )}
              </li>
            ))}
          </ol>
        )}
      </aside>
    </div>
  );
}
