# Setup notes

## Local environment

1. `npm install`
2. Copy `.env.example` to `.env`. `DATABASE_URL` is the only variable so far and points to the Docker database.
3. `npm run db:up` starts PostgreSQL 17 in Docker on `localhost:5432` (user, password and database are all `fms`).
4. `npm run dev`, then check http://localhost:3000/api/health. It returns `{ status, db }`, or a 503 when the database is down.

## One-time context

- `drizzle/schema.ts` and `drizzle/relations.ts` are leftovers from a `drizzle-kit pull` against the empty database. They are not the schema; `src/db/schema.ts` is. Don't edit them.
- `drizzle.config.ts` loads `.env` through `dotenv`, so `drizzle-kit` commands need `.env` in place.
- `next.config.ts` turns on `cacheComponents` and `partialPrefetching`, and loads Tailwind through the `@tailwindcss/turbopack` loader.

## Changelog

Newest first, with absolute dates.

- 2026-10-28: Added meal kinds 無豬 (`no_pork`) and 其它 (`other`, free-text `label` on order and default lines), and custom prices outside `price_tiers`. Migration `0002_rapid_prism` was hand-reordered so the `label` columns exist before the keys that use them.
- 2026-10-28: Added the order service, `/board` with live updates over SSE (Postgres LISTEN/NOTIFY), `/order` simulated ordering, and `npm run db:seed` with sample data.
- 2026-10-28: Added the phase-1 schema (migration `0001_material_vengeance`).
- 2026-10-28: Added `docs/spec.md`, the agreed requirements for the catering system.
- 2026-10-27: Set up Next.js 16 with Tailwind, PostgreSQL in docker-compose, the Drizzle config and client, the `db:*` scripts and `/api/health`. Added CLAUDE.md.
