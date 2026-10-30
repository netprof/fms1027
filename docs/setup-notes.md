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

## Azure

The app runs on Azure App Service (Linux, Node 22). The database is Azure Database for PostgreSQL flexible server 17. Serverless hosting (Static Web Apps, Functions) doesn't fit: the dashboard keeps SSE connections and a LISTEN connection open, and the scheduler runs inside the server. Every push to `develop` builds and deploys through `.github/workflows/azure.yml` to the web app `fms1027-jp` (resource group `rg-fms-demo`, Japan East; plan `fms-plan-jp`; database server `fms1027-db-jp`, database `fms_demo`).

Pick a region the Anthropic API serves. The app first ran in East Asia (Hong Kong), where every Claude call got 403 `forbidden` "Request not allowed" (no request id, Cloudflare edge `HKG`), so LINE orders answered 「系統忙碌中」. It moved to Japan East on 2026-10-29, and the East Asia app, plan and database were deleted.

The first app, `fms1027-demo` (now deleted), was set up through the portal's Deployment Center, which created the OIDC login (managed identity `fms1027-demo-id-9d31`, federated with `develop`) and the `AZUREAPPSERVICE_*` secrets. The workflow still logs in with that identity; it needs Website Contributor on whichever web app it deploys to. The workflow it generated shipped the whole repo, lost `node_modules/.bin` on the way and failed with `next: not found`, so it was replaced.

The build sets `BUILD_STANDALONE=1`, which gives `output: "standalone"`. `.next/standalone` is a self-contained `server.js` with only the traced `node_modules`. The build needs no database or secrets.

One-time setup (`<app>` is the web app name, `<db>` the database server):

1. Create the resources:
   ```bash
   az group create -n fms-rg -l japaneast
   az postgres flexible-server create -g fms-rg -n <db> --version 17 --tier Burstable \
     --sku-name Standard_B1ms --storage-size 32 --admin-user fmsadmin --admin-password '<password>' \
     --public-access 0.0.0.0
   az postgres flexible-server db create -g fms-rg -s <db> -d fms
   az postgres flexible-server firewall-rule create -g fms-rg -s <db> -n AllowAzureServices \n     --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0
   az appservice plan create -g fms-rg -n fms-plan --is-linux --sku B1
   az webapp create -g fms-rg -p fms-plan -n <app> --runtime "NODE:22-lts"
   ```
   The `0.0.0.0` rule lets Azure services, including the web app, reach the database. Without it the app can't connect.
2. Configure the web app:
   ```bash
   az webapp config set -g fms-rg -n <app> --always-on true \
     --startup-file "HOSTNAME=0.0.0.0 node server.js" \
     --generic-configurations '{"healthCheckPath":"/api/health"}'
   az webapp config appsettings set -g fms-rg -n <app> --settings \
     DATABASE_URL="postgres://fmsadmin:<password>@<db>.postgres.database.azure.com:5432/fms?sslmode=verify-full" \
     LINE_CHANNEL_SECRET=... LINE_CHANNEL_ACCESS_TOKEN=... ANTHROPIC_API_KEY=...
   ```
   - Always On is required, or the idle app is stopped and the scheduler and live dashboard stop with it.
   - `HOSTNAME=0.0.0.0` makes `server.js` listen on all interfaces. The container's own `HOSTNAME` would be used otherwise. App Service sets `PORT` itself.
   - Leave out `TRUST_SYSTEM_CA` (company network only) and `SCM_DO_BUILD_DURING_DEPLOYMENT` (the package is already built).
   - `sslmode=verify-full` checks the server certificate. `require` does the same in `pg` 8 but prints a warning.
3. Let GitHub Actions log in through OIDC, with no stored password. The existing identity covers a new web app in the same subscription once it has the role there (`az role assignment create --assignee-object-id <identity principalId> --assignee-principal-type ServicePrincipal --role "Website Contributor" --scope <web app id>`); these steps are for a fresh setup, and the workflow's secret names and `app-name` must then be changed to match:
   ```bash
   APP_ID=$(az ad app create --display-name fms-github-deploy --query appId -o tsv)
   az ad sp create --id $APP_ID
   az ad app federated-credential create --id $APP_ID --parameters '{"name":"main","issuer":"https://token.actions.githubusercontent.com","subject":"repo:netprof/fms1027:ref:refs/heads/develop","audiences":["api://AzureADTokenExchange"]}'
   az role assignment create --assignee $APP_ID --role "Website Contributor" \
     --scope $(az webapp show -g fms-rg -n <app> --query id -o tsv)
   gh secret set AZURE_CLIENT_ID --body $APP_ID
   gh secret set AZURE_TENANT_ID --body $(az account show --query tenantId -o tsv)
   gh secret set AZURE_SUBSCRIPTION_ID --body $(az account show --query id -o tsv)
   gh variable set AZURE_WEBAPP_NAME --body <app>
   ```
   The deploy also needs the database URL as a secret, for its migrate step:
   ```bash
   az webapp config appsettings list -g fms-rg -n <app> --query "[?name=='DATABASE_URL'].value" -o tsv | gh secret set DATABASE_URL
   ```
   The credential only accepts runs on `develop`.
4. Create the first admin from a machine that can reach port 5432, such as Azure Cloud Shell (https://shell.azure.com, covered by the `AllowAzureServices` rule). The company network blocks 5432. The deploy migrates on its own; run `db:migrate` here only if the first deploy hasn't run yet.
   ```bash
   az postgres flexible-server firewall-rule create -g fms-rg -s <db> -n me --start-ip-address <your IP> --end-ip-address <your IP>
   DATABASE_URL="<as above>" npm run db:migrate
   DATABASE_URL="<as above>" npm run admin:create -- admin 管理員 0900-000-000
   ```
   `admin:create` prints a random password once; set `ADMIN_PASSWORD` to choose one instead. Run it again for a username that already exists to reset that login as admin and lift its lockout. Don't run `db:seed` here: it wipes every table. Remove the firewall rule afterwards.
5. Push to `develop`, or run the workflow by hand from the Actions tab. Then check `https://<app>.azurewebsites.net/api/health`.
6. In the LINE Developers console, set the webhook URL to `https://<app>.azurewebsites.net/api/line/webhook` and press Verify.

Demo data: in the Actions tab, run "Seed demo data (Azure)" and type `fms1027-jp` to confirm. It runs `db:seed` with `SEED_KEEP_LOGINS=1`: customers, routes, orders, menus and LINE contacts are replaced, while accounts with a login and their sessions are kept. The 8 sample drivers get no login. Don't use it once real data is in the database.

The workflow runs `npm run db:migrate` (secret `DATABASE_URL`) after the build and before the deploy. GitHub-hosted runners run in Azure, so the `AllowAzureServices` rule lets them in. The old code keeps running until the deploy finishes, so a migration has to work with it too. Add columns as nullable or with a default, and drop or rename them only in a later deploy. If the migration fails, nothing is deployed.

## One-time context

- `drizzle/schema.ts` and `drizzle/relations.ts` are leftovers from a `drizzle-kit pull` against the empty database. They are not the schema; `src/db/schema.ts` is. Don't edit them.
- `drizzle.config.ts` loads `.env` through `dotenv`, so `drizzle-kit` commands need `.env` in place.
- `next.config.ts` turns on `cacheComponents` and `partialPrefetching`, and loads Tailwind through the `@tailwindcss/turbopack` loader.

## Changelog

- 2026-10-30: 每日明細 is now a Flex table (日期/餐/內容/金額 with a subtotal), one card per half month in a carousel; checked with LINE's `/message/validate/reply`.
- 2026-10-30: The LINE bill reply adds a second message, 每日明細: one line per day and meal with items and amount (split at LINE's 5,000-character limit).
- 2026-10-30: The rich menu grows to two rows (2500×1686) with 上月帳單 and 本月帳單. The bot answers `menu:bill-last` / `menu:bill-this` with the site's quantities and amounts from the unit-price snapshots; `monthlyLines()` takes an optional site and end date. Run `npm run line:richmenu -- --replace` after the deploy.
- 2026-10-29: CLAUDE.md describes the LINE binding rules (rate limit, rebinding, unfollow) under `src/lib/line/` and lists `docs/brand/` and `src/pic/` in Layout.
- 2026-10-29: LINE binding hardening. Wrong binding codes count in `login_failures` (username `line:<userId>`, ip `line`): 5 per LINE account or 30 across all within 15 minutes block binding. A LINE account still bound to a deactivated site moves to the new contact when it sends a valid code (it used to fail on the unique `line_user_id`). Blocking the official account sets the new column `line_contacts.unfollowed_at` (migration `0007_tricky_the_hunter`); pushes skip it and the site page shows 已封鎖官方帳號, and unblocking clears it.
- 2026-10-29: LINE rich menu 永發便當 (我要訂餐、查詢訂單、截止時間): `npm run line:richmenu`, image and avatar in `docs/brand/`. The bot answers the `menu:*` postbacks; 查詢訂單 queries the next open meal without the model. It replaced 72 leftover test menus (快捷選單 A/B) that another tool had linked to individual users.
- 2026-10-29: Moved Azure from East Asia to Japan East (web app `fms1027-jp`, plan `fms-plan-jp`, database server `fms1027-db-jp`): the Anthropic API refuses requests from Hong Kong with 403, so LINE orders failed with 「系統忙碌中」. The workflows deploy to and confirm with `fms1027-jp`.
- 2026-10-29: CLAUDE.md gains a Deployment (Azure) section: deploy branch, migration rule, database reachability, local `DATABASE_URL`, Azure CLI path and logs.
- 2026-10-29: The Azure workflow runs `db:migrate` before each deploy, using the new GitHub secret `DATABASE_URL`.
- 2026-10-29: `db:seed` takes `SEED_KEEP_LOGINS=1`, and the manual workflow `seed-demo.yml` loads demo data into the Azure database with it.
- 2026-10-29: The Azure deploy now wipes wwwroot first (`clean: true`). Files left by the Deployment Center deploy (`oryx-manifest.toml`, `node_modules.tar.zst`) made the container swap in their `node_modules`, and login failed with "Server Action not found".
- 2026-10-28: Azure deployment: `.github/workflows/azure.yml` builds a standalone server (`BUILD_STANDALONE=1`) and deploys it to App Service (`fms1027-demo`) on every push to `develop`. It replaces the Deployment Center workflow `develop_fms1027-demo.yml`. Added `npm run admin:create` for a production database's first admin. The login rate limit now drops the port Azure appends to `x-forwarded-for`. `/api/health` and `/api/board/events` call `connection()`, so the build no longer runs them: it used to need a database, and baked in a fixed health result.

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
