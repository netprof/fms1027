// Shared admin styling (Ultima-like). A plain module (not "use client") so
// server components can import the strings themselves.
export const inputClass =
  "rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

export const labelClass = "flex flex-col gap-1 text-xs font-medium text-ink-muted";

export const tableClass =
  "w-full text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:bg-slate-50 [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-left [&_th]:font-medium [&_th]:text-ink-muted [&_tr]:border-b [&_tr]:border-slate-100";

export const primaryButtonClass =
  "rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-primary-dark disabled:opacity-40";

export const dangerButtonClass =
  "rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 transition hover:bg-red-50 disabled:opacity-40";

export const subtleButtonClass =
  "rounded-md border border-slate-300 px-2.5 py-1 text-sm text-ink-muted transition hover:border-primary hover:text-primary disabled:opacity-40";
