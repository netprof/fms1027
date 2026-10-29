@AGENTS.md

# fms

Next.js 16 (App Router, TypeScript, Tailwind v4) + PostgreSQL 17 via Drizzle ORM. README is in Traditional Chinese.

Setup, one-time context and changelog: [docs/setup-notes.md](docs/setup-notes.md)

Product spec (Traditional Chinese): [docs/spec.md](docs/spec.md)

## Commands

- `npm run db:up`: start PostgreSQL in Docker
- `npm run dev` / `build` / `start` / `lint`
- `npm run db:generate`: generate a migration from schema changes
- `npm run db:migrate`: apply migrations
- `npm run db:push`: sync the schema straight to the DB (dev only)
- `npm run db:studio`: Drizzle Studio
- `npm run orders:generate -- [from] [to]`: create missing standing orders for a date range (default today), e.g. after downtime
- `npm run db:seed`: wipe every table and load sample data (`scripts/seed.ts`, dev only). With `SEED_KEEP_LOGINS=1` it keeps employees that have a login and creates drivers without one (no dev passwords)
- `npm run admin:create -- <username> <姓名> [電話]`: create (or reset) an admin login without touching other data; prints a random password unless `ADMIN_PASSWORD` is set. For a fresh production database
- `npm run line:richmenu [-- --replace]`: create the LINE rich menu from `docs/brand/line-richmenu.png` (buttons 我要訂餐/查詢訂單/截止時間 → postbacks `menu:*` in `bot.ts`) and make it the default; `--replace` deletes every other rich menu (per-user menus override the default). Needs `LINE_CHANNEL_ACCESS_TOKEN`

## Layout

- `src/app/`: App Router pages and route handlers
- `src/db/schema.ts`: the Drizzle schema (source of truth). Tables: employees, sessions and login_failures (login and LINE binding-code rate limit), companies, line_contacts (a site's LINE accounts and binding codes), line_drafts (LINE orders awaiting 確認), sites (廠區, the ordering unit), routes (per meal slot) and route_driver_overrides, price_tiers, site_meal_plans, site_default_lines, menus, holidays, orders, order_lines (unit-price snapshot) and order_changes (audit trail and dashboard highlights; `line_contact_id` for LINE orders)
- `src/db/index.ts`: `db` client (`import { db } from "@/db"`)
- `src/lib/meals.ts`: meal slots/kinds, cutoffs and Asia/Taipei date helpers (client-safe)
- `src/lib/orders.ts`: the only place orders are written; enforces cutoffs for customers, flags staff changes after cutoff, creates each day's default orders (`ensureDailyOrders`, idempotent; called by pages and by the scheduler)
- `src/lib/daily-orders.ts`: timer started from `src/instrumentation.ts` on server start; every 5 minutes it makes sure today's (Asia/Taipei) standing orders exist, so billing doesn't depend on page visits. Only today, never future days
- `src/lib/order-events.ts`: order writes `pg_notify` on `order_changes`; the SSE route `/api/board/events` relays them
- `src/lib/board.ts`: dashboard query behind `/api/board`
- `src/lib/reports.ts`: Excel reports (`exceljs`). `/api/reports/daily?date=&slot=` (any employee) and `/api/reports/monthly?month=YYYY-MM` (admins); billing uses each order line's unit-price snapshot. UI at `/admin/reports`
- `src/lib/line/`: phase-2 LINE bot. `bot.ts` runs the conversation (binding by 6-digit code, order → Flex confirmation card → postback 確認/取消, queries; picks the meal, prices and cutoffs itself), `parse.ts` asks `claude-haiku-5-5` for a structured reading of the message (Zod + `messages.parse`; the model never decides prices or cutoffs), `api.ts` verifies signatures and sends replies/pushes (`LINE_DRY_RUN=1` logs instead), `notify.ts` pushes to the site's contacts when staff change an order after cutoff (called from `/admin/orders`). Webhook: `POST /api/line/webhook` (answers at once, handles events in `after()`). Contacts are managed on `/admin/sites/[id]`
- `src/lib/system-ca.ts`: with `TRUST_SYSTEM_CA=1`, `src/instrumentation.ts` adds the OS certificate store at startup (company TLS proxy)
- `src/lib/order-view.ts`: loads what an order editor needs; validates Server Action input
- `src/lib/auth.ts`: staff sessions (random cookie token, stored SHA-256 hashed in `sessions`). Every admin page and Server Action calls `requireEmployee()`; `src/proxy.ts` only redirects cookieless `/admin` requests to `/login`. Login is rate limited (5 failures per username or 30 per IP in 15 minutes, checked before the password); an admin password reset clears the username's failures
- `src/lib/password.ts`: scrypt hashes, no framework imports (the seed uses it)
- `src/components/`: shared UI (`KindIcon` and `price-colors.ts` shared by the board and the route page; `QuantityEditor` used by `/order`, `/admin/orders` and site defaults; `MenuCard`; `ActionForm` for admin Server Actions; `styles.ts` class strings)
- `src/lib/admin-form.ts`: admin Server Action helpers. Wrap every base-data action in `adminAction()` (checks the admin role, refreshes, maps validation and Postgres 23505/23503 errors to messages); read fields with `text()`/`integer()`/`date()`/`checked()` and bound ids with `id()`
- Pages: `/board` (kitchen TV dashboard, public), `/order` (simulated customer ordering, public), `/login`, `/admin/my-route` (driver's routes for a day, phone-first; admins can pick any driver), `/admin/orders` (phone-in changes by staff, with change history)
- Admin-only base data (`requireAdmin()`): `/admin/companies` → `/admin/companies/[id]` → `/admin/sites/[id]` (site, per-slot plan, default quantities), `/admin/routes` → `/admin/routes/[id]` (delivery order, stand-in drivers), `/admin/menus?week=`, `/admin/holidays`, `/admin/prices`, `/admin/employees`
- Back-office look follows PrimeNG Ultima (indigo): `src/app/admin/admin-shell.tsx` (top bar, sidebar, breadcrumb), theme colours `primary`/`ground`/`ink` in `globals.css`, Roboto from `src/app/fonts.ts`. The kitchen board keeps its own full-screen style
- Dev logins after `db:seed`: `admin` / `admin1234`, `staff1`…`staff8` / `staff1234`
- With Cache Components, read cookies/session only inside a `<Suspense>` boundary, and don't call `new Date()` before an uncached read in server components (compare times in SQL instead). `usePathname()` in a client component must also sit inside a `<Suspense>` boundary (dynamic routes fail the build otherwise)
- The build runs without a database. A GET route handler that doesn't read the request is prerendered at build time, so start it with `await connection()` (see `/api/health`)
- `"use server"` files may only export async functions; put shared constants elsewhere (e.g. `src/lib/meals.ts`)
- `scripts/`: dev scripts run with `tsx`
- `drizzle/`: generated migrations

## Deployment (Azure)

Setup steps and the reasons behind each setting: `docs/setup-notes.md` → Azure.

- `develop` is the deploy branch; `main` takes it by PR. A push runs `.github/workflows/azure.yml`:
  1. Build a standalone server (`BUILD_STANDALONE=1` → `output: "standalone"`).
  2. `db:migrate` with the GitHub secret `DATABASE_URL`.
  3. Deploy to App Service `fms1027-jp` (resource group `rg-fms-demo`, Japan East) into a wiped wwwroot.
- Migrations run while the old code still serves, so add columns nullable or with a default, and drop or rename only in a later deploy.
- Region: Japan East. Not East Asia (Hong Kong): the Anthropic API answers requests from Hong Kong with 403 `forbidden` "Request not allowed", which broke LINE orders.
- Database: server `fms1027-db-jp`, database `fms_demo`. It accepts only connections from inside Azure: the app, GitHub Actions, Cloud Shell. The company network blocks outbound 5432, so reach it through a workflow or Cloud Shell, not from this machine.
- `.env` may point `DATABASE_URL` at Azure. For local runs and tests, set `DATABASE_URL=postgres://fms:fms@localhost:5432/fms` explicitly.
- The public site gets logins only from `npm run admin:create`. Demo data comes from `.github/workflows/seed-demo.yml`, which is manual, runs `db:seed` with `SEED_KEEP_LOGINS=1` and keeps the logins.
- Runtime config lives in the web app's settings, not the repo: startup command `HOSTNAME=0.0.0.0 node server.js`, Always On, health check `/api/health`, and the env vars from `.env.example` except `TRUST_SYSTEM_CA`.
- Azure CLI: `C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd` (not on PATH). `az webapp log download -g rg-fms-demo -n fms1027-jp` fetches the logs. Container output is in `LogFiles/StartupLogs/`.

## Conventions

- After changing `src/db/schema.ts`, run `npm run db:generate` and commit the migration.
- Path alias `@/*` → `src/*`.
- When commands, env vars, folders, tables or conventions change, update this file in the same change and add a dated line to the changelog in `docs/setup-notes.md`.
