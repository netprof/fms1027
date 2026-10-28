# Setup notes

## Local environment

1. `npm install`
2. Copy `.env.example` to `.env`. `DATABASE_URL` points to the Docker database. The LINE and Anthropic keys are only needed for the LINE bot. On the company network set `TRUST_SYSTEM_CA=1`: traffic to api.anthropic.com goes through a TLS-inspecting proxy, and Node rejects its certificate otherwise.
3. `npm run db:up` starts PostgreSQL 17 in Docker on `localhost:5432` (user, password and database are all `fms`).
4. `npm run dev`, then check http://localhost:3000/api/health. It returns `{ status, db }`, or a 503 when the database is down.

## LINE bot

1. In the LINE Developers console, open the Messaging API channel (official account 「永發便當」).
2. Set the webhook URL to `https://<public host>/api/line/webhook`, turn on "Use webhook", and press "Verify". It has to be HTTPS and reachable from the internet. For local testing, run a tunnel such as `cloudflared tunnel --url http://localhost:3000` and use the URL it prints.
3. In the LINE Official Account Manager, turn off auto-reply and greeting messages so only the bot answers.
4. In the back office, open a site (客戶 → 公司 → 廠區設定) and add a LINE contact. Give the customer the 6-digit code; they add the account as a friend and send the code.

With `LINE_DRY_RUN=1` nothing is sent to LINE; replies and pushes are logged as `[line:dry-run]`. Webhook requests must still carry a valid `x-line-signature` (HMAC-SHA256 of the body with the channel secret).

## One-time context

- `drizzle/schema.ts` and `drizzle/relations.ts` are leftovers from a `drizzle-kit pull` against the empty database. They are not the schema; `src/db/schema.ts` is. Don't edit them.
- `drizzle.config.ts` loads `.env` through `dotenv`, so `drizzle-kit` commands need `.env` in place.
- `next.config.ts` turns on `cacheComponents` and `partialPrefetching`, and loads Tailwind through the `@tailwindcss/turbopack` loader.

## Changelog

Newest first, with absolute dates.

- 2026-10-28: Phase 2 LINE bot: `/api/line/webhook`, `src/lib/line/` (bot conversation, Claude Haiku 5.5 parsing via structured outputs, Messaging API client, push on after-cutoff staff edits), LINE contacts with binding codes on the site page. Tables `line_contacts`, `line_drafts`, column `order_changes.line_contact_id` (migration `0006_big_surge`). New env vars `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_DRY_RUN`, `ANTHROPIC_API_KEY`, `TRUST_SYSTEM_CA`. New dependencies `@anthropic-ai/sdk`, `zod`.
- 2026-10-28: Login rate limiting: `login_failures` table (migration `0005_needy_firelord`), 5 failures per username or 30 per IP within 15 minutes block login; an admin password reset lifts it. The IP comes from `x-forwarded-for`, so only trust it behind your own reverse proxy.
- 2026-10-28: Standing orders are now created by a scheduler (`src/instrumentation.ts` → `src/lib/daily-orders.ts`, checks every 5 minutes, today only) instead of only on page visits. Added `npm run orders:generate` to backfill a date range.
- 2026-10-28: Added Excel reports (`exceljs`): daily route/kitchen sheet for any employee and the monthly statement (company, site and line-by-line sheets) for admins, at `/admin/reports`.
- 2026-10-28: Added `/admin/my-route`, the drivers' phone page (routes for a day incl. stand-ins, delivery order, address and tap-to-call contact, after-cutoff changes in blue). Board data now carries `driverId` and site contact fields. Seed sites get fake addresses and contacts.
- 2026-10-28: Added admin-only base-data maintenance (customers and sites with per-slot plans and default quantities, routes with delivery order and stand-in drivers, weekly menus, holidays, price tiers, employees/accounts) and restyled the back office and login after PrimeNG Ultima (indigo top bar, sidebar, breadcrumb, cards, Roboto).
- 2026-10-28: Added staff login (`sessions` table, migration `0004_silly_titania`), `src/proxy.ts`, and `/admin/orders` for phone-in changes with reason and history. Seed creates dev logins. The session cookie is `Secure` only when `x-forwarded-proto` is `https`, so login also works over plain HTTP on a LAN; serve over HTTPS in production.
- 2026-10-28: Added meal kind 無牛 (`no_beef`, migration `0003_eager_mongoose`). Dashboard: lucide icons (`lucide-react`), validated categorical colours for price tiers, status legend top right, per-route and grand-total price × kind tables. Seed now makes 20–25 sites per route across 40 fictional companies.
- 2026-10-28: Dashboard shows each order line as a meal-kind icon coloured by price tier, and highlights changes per line (computed in `src/lib/board.ts` by replaying `order_changes`) instead of per site.
- 2026-10-28: Added meal kinds 無豬 (`no_pork`) and 其它 (`other`, free-text `label` on order and default lines), and custom prices outside `price_tiers`. Migration `0002_rapid_prism` was hand-reordered so the `label` columns exist before the keys that use them.
- 2026-10-28: Added the order service, `/board` with live updates over SSE (Postgres LISTEN/NOTIFY), `/order` simulated ordering, and `npm run db:seed` with sample data.
- 2026-10-28: Added the phase-1 schema (migration `0001_material_vengeance`).
- 2026-10-28: Added `docs/spec.md`, the agreed requirements for the catering system.
- 2026-10-27: Set up Next.js 16 with Tailwind, PostgreSQL in docker-compose, the Drizzle config and client, the `db:*` scripts and `/api/health`. Added CLAUDE.md.
