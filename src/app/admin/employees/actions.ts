"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { employees, loginFailures, sessions } from "@/db/schema";
import {
  FormError,
  adminAction,
  checked,
  id,
  optionalText,
  text,
} from "@/lib/admin-form";
import { hashPassword } from "@/lib/password";

const MIN_PASSWORD = 8;

function role(fd: FormData): "admin" | "staff" {
  return fd.get("role") === "admin" ? "admin" : "staff";
}

function username(fd: FormData) {
  const value = optionalText(fd, "username", "帳號", 30);
  if (value && !/^[A-Za-z0-9_.-]+$/.test(value)) {
    throw new FormError("帳號只能用英數字與 _ . -");
  }
  return value;
}

async function password(fd: FormData, required: boolean) {
  const value = String(fd.get("password") ?? "");
  if (!value && !required) return undefined;
  if (value.length < MIN_PASSWORD) {
    throw new FormError(`密碼至少 ${MIN_PASSWORD} 個字元`);
  }
  return hashPassword(value);
}

export async function createEmployee(fd: FormData) {
  return adminAction(async () => {
    const login = username(fd);
    await db.insert(employees).values({
      name: text(fd, "name", "姓名", { max: 30 }),
      phone: text(fd, "phone", "電話", { max: 30 }),
      role: role(fd),
      username: login,
      // An employee without a login (driver only) needs no password.
      passwordHash: login ? await password(fd, true) : null,
    });
    return "已新增";
  });
}

export async function updateEmployee(employeeId: number, fd: FormData) {
  return adminAction(async (admin) => {
    const target = id(employeeId);
    const active = checked(fd, "active");
    const newRole = role(fd);
    // Never let an admin lock themselves out.
    if (target === admin.id && (!active || newRole !== "admin")) {
      throw new FormError("不能停用自己或取消自己的管理者權限");
    }
    const login = username(fd);
    const hash = await password(fd, false);

    await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ passwordHash: employees.passwordHash })
        .from(employees)
        .where(eq(employees.id, target));
      if (!current) throw new FormError("找不到此員工");
      if (login && !hash && !current.passwordHash) {
        throw new FormError("設定帳號時請一併設定密碼");
      }
      await tx
        .update(employees)
        .set({
          name: text(fd, "name", "姓名", { max: 30 }),
          phone: text(fd, "phone", "電話", { max: 30 }),
          role: newRole,
          active,
          username: login,
          ...(hash ? { passwordHash: hash } : {}),
          ...(login ? {} : { passwordHash: null }),
        })
        .where(eq(employees.id, target));
      // A new password or removed login signs the person out everywhere
      // (except an admin changing their own password, who stays signed in).
      if ((hash || !login || !active) && target !== admin.id) {
        await tx.delete(sessions).where(eq(sessions.employeeId, target));
      }
      // A password reset also lifts a login lockout.
      if (hash && login) {
        await tx.delete(loginFailures).where(eq(loginFailures.username, login.toLowerCase()));
      }
    });
  });
}
