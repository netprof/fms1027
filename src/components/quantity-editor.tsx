"use client";

// The meal kind × price grid shared by the simulated order page (customer
// rules: past-cutoff rows are locked), the back office (staff may edit past
// cutoff; those rows are only marked) and a site's default quantities (no
// cutoffs, no custom price).
import {
  KIND_LABEL,
  MEAL_KINDS,
  formatCutoff,
  type MealKind,
} from "@/lib/meals";
import type { OrderLine } from "@/lib/orders";

// A price column is a fixed price, or CUSTOM for the "其它" price typed in
// the column header.
type Column = number | typeof CUSTOM;
const CUSTOM = "custom";

export type EditorState = {
  quantities: Record<string, number>; // `${kind}:${column}` → quantity
  customPrice: string;
  otherLabel: string; // one free-text label per order
};

const cell = (kind: MealKind, column: Column) => `${kind}:${column}`;

export function editorFromLines(lines: OrderLine[]): EditorState {
  const quantities: Record<string, number> = {};
  for (const l of lines) {
    const key = cell(l.kind, l.unitPrice);
    quantities[key] = (quantities[key] ?? 0) + l.quantity;
  }
  return {
    quantities,
    customPrice: "",
    otherLabel: lines.find((l) => l.kind === "other")?.label ?? "",
  };
}

export function linesFromEditor(
  state: EditorState,
): { lines: OrderLine[] } | { error: string } {
  const lines: OrderLine[] = [];
  for (const [key, quantity] of Object.entries(state.quantities)) {
    if (quantity <= 0) continue;
    const [kind, column] = key.split(":") as [MealKind, string];
    const unitPrice = Number(column === CUSTOM ? state.customPrice : column);
    if (column === CUSTOM && !(Number.isInteger(unitPrice) && unitPrice > 0)) {
      return { error: "請在「其它」價位欄填寫單價。" };
    }
    lines.push({
      kind,
      unitPrice,
      quantity,
      label: kind === "other" ? state.otherLabel : undefined,
    });
  }
  return { lines };
}

export function QuantityEditor({
  state,
  onChange,
  defaultPrice,
  prices,
  orderPrices,
  cutoffs,
  now = 0,
  lockClosed = false,
  allowCustomPrice = true,
}: {
  state: EditorState;
  onChange: (state: EditorState) => void;
  defaultPrice: number;
  prices: number[];
  // Prices on the loaded order, so custom prices keep their own column.
  orderPrices: number[];
  // Omitted: no cutoff column and nothing is ever closed.
  cutoffs?: Record<MealKind, string>;
  now?: number;
  // true: rows past cutoff are disabled (customers). false: staff may edit.
  lockClosed?: boolean;
  allowCustomPrice?: boolean;
}) {
  const closed = (kind: MealKind) =>
    !!cutoffs && now >= new Date(cutoffs[kind]).getTime();
  const columns: Column[] = [
    ...new Set([defaultPrice, ...prices, ...orderPrices]),
    ...(allowCustomPrice ? [CUSTOM as Column] : []),
  ];
  const setQuantity = (key: string, value: string) =>
    onChange({
      ...state,
      quantities: {
        ...state.quantities,
        [key]: Math.max(0, Math.floor(Number(value) || 0)),
      },
    });

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-zinc-500">
          <th className="py-2 font-normal">餐別</th>
          {columns.map((p) =>
            p === CUSTOM ? (
              <th key={p} className="py-2 font-normal">
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  placeholder="其它"
                  aria-label="其它價位單價"
                  className="w-16 rounded border border-zinc-300 bg-transparent p-1 text-sm"
                  value={state.customPrice}
                  onChange={(e) =>
                    onChange({ ...state, customPrice: e.target.value })
                  }
                />{" "}
                元
              </th>
            ) : (
              <th key={p} className="py-2 font-normal">
                {p} 元{p === defaultPrice && "（預設）"}
              </th>
            ),
          )}
          {cutoffs && <th className="py-2 font-normal">截止</th>}
        </tr>
      </thead>
      <tbody>
        {MEAL_KINDS.map((kind) => {
          const isClosed = closed(kind);
          const disabled = lockClosed && isClosed;
          return (
            <tr
              key={kind}
              className={`border-t border-zinc-200 ${isClosed && !lockClosed ? "bg-amber-50" : ""}`}
            >
              <td className="py-2 pr-2 font-medium">
                {KIND_LABEL[kind]}
                {kind === "other" && (
                  <input
                    type="text"
                    maxLength={30}
                    placeholder="內容，如不吃辣"
                    aria-label="其它餐別內容"
                    className="mt-1 block w-28 rounded border border-zinc-300 bg-transparent p-1 text-xs font-normal disabled:opacity-40"
                    disabled={disabled}
                    value={state.otherLabel}
                    onChange={(e) =>
                      onChange({ ...state, otherLabel: e.target.value })
                    }
                  />
                )}
              </td>
              {columns.map((p) => (
                <td key={p} className="py-2 pr-2">
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    aria-label={`${KIND_LABEL[kind]} ${p === CUSTOM ? "其它價位" : `${p} 元`}份數`}
                    className="w-20 rounded border border-zinc-300 bg-transparent p-1.5 disabled:opacity-40"
                    disabled={disabled}
                    value={state.quantities[cell(kind, p)] ?? 0}
                    onChange={(e) => setQuantity(cell(kind, p), e.target.value)}
                  />
                </td>
              ))}
              {cutoffs && (
                <td
                  className={`py-2 text-xs ${isClosed ? "text-red-600" : "text-zinc-500"}`}
                >
                  {formatCutoff(new Date(cutoffs[kind]))}
                  {isClosed && " 已截止"}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
