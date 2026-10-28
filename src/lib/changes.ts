// Pure helpers for describing order changes. Safe to import from client code.
import { lineLabel } from "./meals";
import type { OrderLine } from "./orders";

export type ChangeKind = "new" | "modified" | "cancelled";

export const lineKey = (l: OrderLine) =>
  `${l.kind}:${l.unitPrice}:${l.label ?? ""}`;

const total = (lines: OrderLine[]) => lines.reduce((n, l) => n + l.quantity, 0);

// Whole-order classification: first order, full cancellation, or an edit.
export function classifyChange(
  before: OrderLine[],
  after: OrderLine[],
): ChangeKind {
  if (total(after) === 0) return "cancelled";
  if (total(before) === 0) return "new";
  return "modified";
}

// "葷70 12→15、無豬70 0→2"
export function describeChange(before: OrderLine[], after: OrderLine[]): string {
  const b = new Map(before.map((l) => [lineKey(l), l]));
  const a = new Map(after.map((l) => [lineKey(l), l]));
  const parts: string[] = [];
  for (const key of new Set([...b.keys(), ...a.keys()])) {
    const was = b.get(key)?.quantity ?? 0;
    const now = a.get(key)?.quantity ?? 0;
    if (was === now) continue;
    const line = (a.get(key) ?? b.get(key))!;
    parts.push(`${lineLabel(line)}${line.unitPrice} ${was}→${now}`);
  }
  return parts.join("、") || "—";
}
