// Helpers for the admin Server Actions: read and validate FormData fields,
// run the change as an admin, and turn known failures into messages.
import "server-only";
import { refresh } from "next/cache";
import { requireAdmin, type Employee } from "./auth";
import { isIsoDate } from "./meals";

import type { FormState } from "@/components/action-form";

export type { FormState };

// Thrown by field readers and actions; becomes the form's error message.
export class FormError extends Error {}

export function text(
  fd: FormData,
  name: string,
  label: string,
  { required = true, max = 100 }: { required?: boolean; max?: number } = {},
): string {
  const value = String(fd.get(name) ?? "").trim();
  if (required && !value) throw new FormError(`請填寫${label}`);
  if (value.length > max) throw new FormError(`${label}最多 ${max} 字`);
  return value;
}

export function optionalText(fd: FormData, name: string, label: string, max = 200) {
  return text(fd, name, label, { required: false, max }) || null;
}

export function integer(
  fd: FormData,
  name: string,
  label: string,
  { min = 0, max = 99_999 }: { min?: number; max?: number } = {},
): number {
  const raw = String(fd.get(name) ?? "").trim();
  const value = Number(raw);
  if (!raw || !Number.isInteger(value) || value < min || value > max) {
    throw new FormError(`${label}必須是 ${min} 到 ${max} 的整數`);
  }
  return value;
}

export function date(fd: FormData, name: string, label: string): string {
  const value = String(fd.get(name) ?? "");
  if (!isIsoDate(value)) throw new FormError(`請選擇${label}`);
  return value;
}

// Ids bound into actions come back from the browser; check them.
export function id(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new FormError("資料不正確");
  }
  return value as number;
}

export function checked(fd: FormData, name: string): boolean {
  return fd.get(name) === "on";
}

// Postgres error codes, possibly wrapped by Drizzle in `cause`.
function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.cause?.code ?? e?.code;
}

// Runs fn as an admin and refreshes the page on success. Validation and
// constraint failures come back as messages; anything else (including
// redirect()) is rethrown.
export async function adminAction(
  fn: (admin: Employee) => Promise<string | void>,
): Promise<FormState> {
  const admin = await requireAdmin();
  try {
    const message = await fn(admin);
    refresh();
    return { ok: true, message: message ?? "已儲存" };
  } catch (err) {
    if (err instanceof FormError) return { ok: false, message: err.message };
    if (pgCode(err) === "23505") return { ok: false, message: "資料重複，請換一個名稱或值" };
    if (pgCode(err) === "23503") return { ok: false, message: "仍有其他資料使用中，無法刪除" };
    throw err;
  }
}
