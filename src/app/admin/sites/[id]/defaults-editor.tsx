"use client";

import { useState, useTransition } from "react";
import type { FormState } from "@/components/action-form";
import {
  QuantityEditor,
  editorFromLines,
  linesFromEditor,
} from "@/components/quantity-editor";
import type { MealSlot } from "@/lib/meals";
import type { OrderLine } from "@/lib/orders";
import { saveDefaults } from "../../companies/actions";

export function DefaultsEditor({
  siteId,
  slot,
  defaultPrice,
  prices,
  lines,
}: {
  siteId: number;
  slot: MealSlot;
  defaultPrice: number;
  prices: number[];
  lines: OrderLine[];
}) {
  const [editor, setEditor] = useState(() => editorFromLines(lines));
  const [state, setState] = useState<FormState>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const parsed = linesFromEditor(editor);
    if ("error" in parsed) {
      setState({ ok: false, message: parsed.error });
      return;
    }
    startTransition(async () => {
      setState(await saveDefaults(siteId, slot, parsed.lines));
    });
  }

  return (
    <div className="space-y-2">
      <QuantityEditor
        state={editor}
        onChange={setEditor}
        defaultPrice={defaultPrice}
        prices={prices}
        orderPrices={lines.map((l) => l.unitPrice)}
        allowCustomPrice={false}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-primary-dark disabled:opacity-40"
        >
          {pending ? "處理中…" : "儲存預設份數"}
        </button>
        {state && (
          <span role="status" className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>
            {state.message}
          </span>
        )}
      </div>
    </div>
  );
}
