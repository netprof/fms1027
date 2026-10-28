"use client";

import { useState, useTransition, type ReactNode } from "react";
import { dangerButtonClass, primaryButtonClass, subtleButtonClass } from "./styles";

export type FormState = { ok: boolean; message: string } | null;

// A form for an admin Server Action. Submits through onSubmit rather than
// the action prop so a failed save keeps what the user typed (React resets
// action-prop forms after every submit).
export function ActionForm({
  action,
  children,
  submitLabel = "儲存",
  confirm,
  resetOnSuccess = false,
  className = "",
  danger = false,
  subtle = false,
  quiet = false,
}: {
  action: (formData: FormData) => Promise<FormState>;
  children?: ReactNode;
  submitLabel?: string;
  confirm?: string;
  resetOnSuccess?: boolean;
  className?: string;
  danger?: boolean;
  // Outlined secondary button for row actions such as reorder arrows.
  subtle?: boolean;
  // Only report failures (for small buttons like reorder arrows).
  quiet?: boolean;
}) {
  const [state, setState] = useState<FormState>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const form = e.currentTarget;
        const data = new FormData(form);
        startTransition(async () => {
          const result = await action(data);
          setState(result);
          if (result?.ok && resetOnSuccess) form.reset();
        });
      }}
    >
      {children}
      <span className="inline-flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className={
            danger ? dangerButtonClass : subtle ? subtleButtonClass : primaryButtonClass
          }
        >
          {pending ? "處理中…" : submitLabel}
        </button>
        {state && !(quiet && state.ok) && (
          <span
            role="status"
            className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}
          >
            {state.message}
          </span>
        )}
      </span>
    </form>
  );
}
