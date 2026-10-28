"use server";

import { redirect } from "next/navigation";
import {
  LOCKOUT_MINUTES,
  checkCredentials,
  clearLoginFailures,
  clientIp,
  endSession,
  loginBlocked,
  recordLoginFailure,
  startSession,
} from "@/lib/auth";

// username comes back so the field survives React's form reset after a
// failed attempt.
export type LoginState = { error: string; username: string } | null;

// Only back-office paths are accepted, so ?next= can't send people offsite.
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return /^\/admin(\/|$)/.test(next) ? next : "/admin/orders";
}

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) return { error: "請輸入帳號與密碼", username };

  const ip = await clientIp();
  if (await loginBlocked(username, ip)) {
    return { error: `嘗試次數過多，請 ${LOCKOUT_MINUTES} 分鐘後再試`, username };
  }
  const employee = await checkCredentials(username, password);
  if (!employee) {
    await recordLoginFailure(username, ip);
    return { error: "帳號或密碼錯誤", username };
  }

  await clearLoginFailures(username);
  await startSession(employee.id);
  redirect(safeNext(formData.get("next")));
}

export async function logout() {
  await endSession();
  redirect("/login");
}
