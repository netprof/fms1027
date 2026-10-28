// Back-office sessions: a random token in an httpOnly cookie, stored hashed
// in the sessions table. Every page and Server Action that needs staff calls
// requireEmployee() itself; src/proxy.ts only does an optimistic redirect.
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { employees, sessions } from "@/db/schema";
import { verifyPassword } from "./password";

export const SESSION_COOKIE = "fms_session";
const SESSION_DAYS = 7;

export type Employee = {
  id: number;
  name: string;
  role: "admin" | "staff";
};

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

// Returns the employee, or null for a wrong username/password or an
// inactive account. Both cases look the same to the caller.
export async function checkCredentials(
  username: string,
  password: string,
): Promise<Employee | null> {
  const [row] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.username, username), eq(employees.active, true)));
  if (!row?.passwordHash) return null;
  if (!(await verifyPassword(password, row.passwordHash))) return null;
  return { id: row.id, name: row.name, role: row.role };
}

export async function startSession(employeeId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db
    .insert(sessions)
    .values({ id: hashToken(token), employeeId, expiresAt });
  // Secure only over HTTPS (directly or behind a proxy): a Secure cookie
  // sent over plain HTTP on a LAN would be dropped and login would fail.
  const proto = (await headers()).get("x-forwarded-proto");
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: proto === "https",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  }
  jar.delete(SESSION_COOKIE);
}

export async function getCurrentEmployee(): Promise<Employee | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({ id: employees.id, name: employees.name, role: employees.role })
    .from(sessions)
    .innerJoin(employees, eq(employees.id, sessions.employeeId))
    .where(
      and(
        eq(sessions.id, hashToken(token)),
        // Compare in SQL: a JS clock read here would block prerendering.
        gt(sessions.expiresAt, sql`now()`),
        eq(employees.active, true),
      ),
    );
  return row ?? null;
}

export async function requireEmployee(): Promise<Employee> {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/login");
  return employee;
}
