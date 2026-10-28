import { connection } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export async function GET() {
  await connection(); // check on each request, not once at build time
  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: "ok", db: "up" });
  } catch {
    return Response.json({ status: "error", db: "down" }, { status: 503 });
  }
}
