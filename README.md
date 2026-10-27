# fms1027

Next.js（App Router）全端 + PostgreSQL + Drizzle ORM。

## 開發環境啟動

需求：Node.js、Docker Desktop。

```bash
npm install
cp .env.example .env      # 預設連到 docker compose 的 PostgreSQL
npm run db:up             # 啟動 PostgreSQL（localhost:5432）
npm run dev               # http://localhost:3000
```

確認資料庫連線：<http://localhost:3000/api/health>

## 資料庫

- Schema：`src/db/schema.ts`
- DB client：`src/db/index.ts`（`import { db } from "@/db"`）
- Migration 檔：`drizzle/`

| 指令 | 用途 |
| --- | --- |
| `npm run db:generate` | 依 schema 變更產生 migration |
| `npm run db:migrate` | 套用 migration |
| `npm run db:push` | 直接把 schema 同步到資料庫（僅限開發用） |
| `npm run db:studio` | 開啟 Drizzle Studio |
