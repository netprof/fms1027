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
- `npm run db:seed`: wipe every table and load sample data (`scripts/seed.ts`, dev only)

## Layout

- `src/app/`: App Router pages and route handlers
- `src/db/schema.ts`: the Drizzle schema (source of truth). Tables: employees, companies, sites (廠區, the ordering unit), routes (per meal slot) and route_driver_overrides, price_tiers, site_meal_plans, site_default_lines, menus, holidays, orders, order_lines (unit-price snapshot) and order_changes (audit trail and dashboard highlights)
- `src/db/index.ts`: `db` client (`import { db } from "@/db"`)
- `src/lib/meals.ts`: meal slots/kinds, cutoffs and Asia/Taipei date helpers (client-safe)
- `src/lib/orders.ts`: the only place orders are written; enforces cutoffs for customers, flags staff changes after cutoff, creates each day's default orders lazily (`ensureDailyOrders`)
- `src/lib/order-events.ts`: order writes `pg_notify` on `order_changes`; the SSE route `/api/board/events` relays them
- `src/lib/board.ts`: dashboard query behind `/api/board`
- `src/lib/order-view.ts`: loads what an order editor needs; validates Server Action input
- `src/lib/auth.ts`: staff sessions (random cookie token, stored SHA-256 hashed in `sessions`). Every admin page and Server Action calls `requireEmployee()`; `src/proxy.ts` only redirects cookieless `/admin` requests to `/login`
- `src/lib/password.ts`: scrypt hashes, no framework imports (the seed uses it)
- `src/components/`: shared UI (`QuantityEditor` used by `/order`, `/admin/orders` and site defaults; `MenuCard`; `ActionForm` for admin Server Actions; `styles.ts` class strings)
- `src/lib/admin-form.ts`: admin Server Action helpers. Wrap every base-data action in `adminAction()` (checks the admin role, refreshes, maps validation and Postgres 23505/23503 errors to messages); read fields with `text()`/`integer()`/`date()`/`checked()` and bound ids with `id()`
- Pages: `/board` (kitchen TV dashboard, public), `/order` (simulated customer ordering, public), `/login`, `/admin/orders` (phone-in changes by staff, with change history)
- Admin-only base data (`requireAdmin()`): `/admin/companies` → `/admin/companies/[id]` → `/admin/sites/[id]` (site, per-slot plan, default quantities), `/admin/routes` → `/admin/routes/[id]` (delivery order, stand-in drivers), `/admin/menus?week=`, `/admin/holidays`, `/admin/prices`, `/admin/employees`
- Back-office look follows PrimeNG Ultima (indigo): `src/app/admin/admin-shell.tsx` (top bar, sidebar, breadcrumb), theme colours `primary`/`ground`/`ink` in `globals.css`, Roboto from `src/app/fonts.ts`. The kitchen board keeps its own full-screen style
- Dev logins after `db:seed`: `admin` / `admin1234`, `staff1`…`staff8` / `staff1234`
- With Cache Components, read cookies/session only inside a `<Suspense>` boundary, and don't call `new Date()` before an uncached read in server components (compare times in SQL instead). `usePathname()` in a client component must also sit inside a `<Suspense>` boundary (dynamic routes fail the build otherwise)
- `"use server"` files may only export async functions; put shared constants elsewhere (e.g. `src/lib/meals.ts`)
- `scripts/`: dev scripts run with `tsx`
- `drizzle/`: generated migrations

## Conventions

- After changing `src/db/schema.ts`, run `npm run db:generate` and commit the migration.
- Path alias `@/*` → `src/*`.
- When commands, env vars, folders, tables or conventions change, update this file in the same change and add a dated line to the changelog in `docs/setup-notes.md`.
