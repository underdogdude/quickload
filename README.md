# Quickload monorepo

Turborepo with:

- `apps/user` — Next.js 14 (LIFF) customer app
- `apps/admin` — Next.js 14 staff dashboard (Supabase Auth)
- `packages/shared` — Drizzle schema, Supabase helpers, LINE + legacy utilities

## Prereqs

- Node 18+
- pnpm 9+
- Supabase project (Postgres) — use **transaction pooler** URL on port **6543** for Drizzle (`DATABASE_URL`)

## Setup

```bash
pnpm install
cp .env.example .env
```

(Run these from the repository root after you clone or open the project folder.)

Fill `.env` at repo root for Drizzle. Copy env vars into:

- `apps/user/.env.local`
- `apps/admin/.env.local`

Minimum for local dev:

- **User app:** `NEXT_PUBLIC_LIFF_ID`, `IRON_SESSION_PASSWORD` (32+ chars), `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LEGACY_API_BASE_URL`
- **Admin app:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `LINE_CHANNEL_ACCESS_TOKEN` (for pushes), `LEGACY_API_BASE_URL`

## Database

```bash
pnpm db:push
```

Uses Drizzle Kit against `DATABASE_URL`. Enable **RLS** in Supabase with policies that allow `service_role` full access for Phase 1 (API routes use the service role on the server).

## Dev

```bash
pnpm dev
```

Runs Turbo `dev` for all packages (user on :3000, admin on :3001 per app scripts).

## Build

```bash
pnpm build
```

## Notion tasks

If Notion MCP is unavailable, use [docs/notion-phase1-tasks.md](docs/notion-phase1-tasks.md) to create tasks manually.

## Deploy

- Two Vercel projects: root `apps/user` and `apps/admin`
- Admin cron: configured in [apps/admin/vercel.json](apps/admin/vercel.json) (`/api/cron/ping`)
