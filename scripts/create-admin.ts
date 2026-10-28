// Creates the first admin on a fresh (production) database, or resets an
// existing login to admin with a new password (also lifts a login lockout).
// Unlike db:seed it touches nothing else.
//   npm run admin:create -- <username> <姓名> [電話]
// The password comes from ADMIN_PASSWORD, or a random one is printed once.
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { employees, loginFailures } from "@/db/schema";
import { hashPassword } from "@/lib/password";

const [username, name, phone = ""] = process.argv.slice(2);
if (!username || !name) {
  console.error("usage: npm run admin:create -- <username> <姓名> [電話]");
  process.exit(1);
}
const given = process.env.ADMIN_PASSWORD;
if (given !== undefined && given.length < 8) {
  console.error("ADMIN_PASSWORD must be at least 8 characters");
  process.exit(1);
}
const password = given ?? randomBytes(9).toString("base64url");

async function main() {
  const passwordHash = await hashPassword(password);
  const [existing] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.username, username));
  if (existing) {
    await db
      .update(employees)
      .set({ name, role: "admin", active: true, passwordHash, ...(phone && { phone }) })
      .where(eq(employees.id, existing.id));
    console.log(`reset ${username} as admin`);
  } else {
    await db.insert(employees).values({ name, phone, role: "admin", username, passwordHash });
    console.log(`created admin ${username}`);
  }
  await db.delete(loginFailures).where(eq(loginFailures.username, username.toLowerCase()));
  if (given === undefined) console.log(`password: ${password}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
