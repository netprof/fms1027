// Pure helpers for describing order changes. Safe to import from client code.
import { lineLabel } from "./meals";
import type { OrderLine } from "./orders";

export type ChangeKind = "new" | "modified" | "cancelled";

export const lineKey = (l: OrderLine) =>
  `${l.kind}:${l.unitPrice}:${l.label ?? ""}`;

export type LineDiff = {
  key: string;
  text: string; // "葷70 12→15"
  // Any line that ends at 0 is a deletion.
  kind: ChangeKind;
};

export function diffLines(before: OrderLine[], after: OrderLine[]): LineDiff[] {
  const b = new Map(before.map((l) => [lineKey(l), l]));
  const a = new Map(after.map((l) => [lineKey(l), l]));
  const diffs: LineDiff[] = [];
  for (const key of new Set([...b.keys(), ...a.keys()])) {
    const was = b.get(key)?.quantity ?? 0;
    const now = a.get(key)?.quantity ?? 0;
    if (was === now) continue;
    const line = (a.get(key) ?? b.get(key))!;
    diffs.push({
      key,
      text: `${lineLabel(line)}${line.unitPrice} ${was}→${now}`,
      kind: now === 0 ? "cancelled" : was === 0 ? "new" : "modified",
    });
  }
  return diffs;
}

// "葷70 12→15、無豬70 0→2"
export function describeChange(before: OrderLine[], after: OrderLine[]): string {
  return diffLines(before, after).map((d) => d.text).join("、") || "—";
}
