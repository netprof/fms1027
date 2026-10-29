// Back-office sessions: a random token in an httpOnly cookie, stored hashed
// in the sessions table. Every page and Server Action that needs staff calls
// requireEmployee() itself; src/proxy.ts only does an optimistic redirect.
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt, or, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { employees, loginFailures, sessions } from "@/db/schema";
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

// Rate limit: 5 failures per username or 30 per IP within 15 minutes block
// further attempts until the oldest one ages out. Checked before the
// password, so a locked account can't be probed.
export const LOCKOUT_MINUTES = 15;
const MAX_FAILURES_PER_USER = 5;
const MAX_FAILURES_PER_IP = 30;
const recent = sql`now() - make_interval(mins => ${LOCKOUT_MINUTES})`;

// The first x-forwarded-for hop; only trustworthy behind our own proxy, so
// the per-username limit is the one that matters.
export async function clientIp(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip");
  return ip ? stripPort(ip) : "unknown";
}

// Azure App Service forwards "1.2.3.4:51234" and "[::1]:51234"; the port
// changes per connection and would defeat the per-IP limit.
function stripPort(ip: string): string {
  const bracketed = ip.match(/^\[(.+)\](?::\d+)?$/);
  if (bracketed) return bracketed[1];
  const v4 = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  return v4 ? v4[1] : ip;
}

export async function loginBlocked(username: string, ip: string): Promise<boolean> {
  const name = username.toLowerCase();
  const [row] = await db
    .select({
      byUser: sql<number>`count(*) filter (where ${loginFailures.username} = ${name})`.mapWith(Number),
      byIp: sql<number>`count(*) filter (where ${loginFailures.ip} = ${ip})`.mapWith(Number),
    })
    .from(loginFailures)
    .where(
      and(
        gt(loginFailures.at, recent),
        or(eq(loginFailures.username, name), eq(loginFailures.ip, ip)),
      ),
    );
  return row.byUser >= MAX_FAILURES_PER_USER || row.byIp >= MAX_FAILURES_PER_IP;
}

export async function recordLoginFailure(username: string, ip: string) {
  await db.insert(loginFailures).values({ username: username.toLowerCase(), ip });
  await db.delete(loginFailures).where(lt(loginFailures.at, sql`now() - interval '1 day'`));
}

export async function clearLoginFailures(username: string) {
  await db.delete(loginFailures).where(eq(loginFailures.username, username.toLowerCase()));
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

// cache(): the layout nav, the page and its actions share one lookup per request.
export const getCurrentEmployee = cache(async (): Promise<Employee | null> => {
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
});

export async function requireEmployee(): Promise<Employee> {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/login");
  return employee;
}

// Base data (customers, routes, menus, accounts…) is admin-only. Staff who
// land on those pages go back to phone orders.
export async function requireAdmin(): Promise<Employee> {
  const employee = await requireEmployee();
  if (employee.role !== "admin") redirect("/admin/orders");
  return employee;
}
