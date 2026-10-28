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

## Layout

- `src/app/`: App Router pages and route handlers
- `src/db/schema.ts`: the Drizzle schema (source of truth). Tables: employees, companies, sites (廠區, the ordering unit), routes (per meal slot) and route_driver_overrides, price_tiers, site_meal_plans, site_default_lines, menus, holidays, orders, order_lines (unit-price snapshot) and order_changes (audit trail and dashboard highlights)
- `src/db/index.ts`: `db` client (`import { db } from "@/db"`)
- `drizzle/`: generated migrations

## Conventions

- After changing `src/db/schema.ts`, run `npm run db:generate` and commit the migration.
- Path alias `@/*` → `src/*`.
- When commands, env vars, folders, tables or conventions change, update this file in the same change and add a dated line to the changelog in `docs/setup-notes.md`.
