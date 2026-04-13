# Quickload (LINE OA) — Phase 1 tasks for Notion

Notion MCP was not available in the automation environment. Create these rows in your **Tasks** database (or paste into a project page).

## Phase 1 MVP (15)

1. **Monorepo setup** — Turborepo + pnpm workspaces; `apps/user`, `apps/admin`, `packages/shared` (+ optional `packages/ui`); root `package.json`, `turbo.json`, `pnpm-workspace.yaml`, `.env.example`.
2. **Database** — Drizzle `schema.ts` (users, admin_users, parcels, pickup_slots, pickup_requests, notification_log); `drizzle.config.ts`; migrations under `packages/shared/src/db/migrations`; `pnpm db:push` / generate workflow.
3. **LINE auth** — LIFF provider + `middleware.ts` (non-`/api`); `POST /api/auth/line` verifying token at LINE; iron-session cookie; upsert `users`.
4. **Admin auth** — Supabase `signInWithPassword`; `@supabase/ssr` cookies; `(protected)` layout + server `getUser()` redirect to `/login`.
5. **User Menu 1 — Register parcel** — Parcel form + create parcel API.
6. **User Menu 3 — Tracking** — Tracking page + legacy adapter (`getLegacyTrackingEvents`, etc.).
7. **User Menu 4 — Payment balance** — Payment page + legacy balance API.
8. **User Menu 6 — Help** — Static FAQ + LINE official chat link.
9. **Admin — Parcels** — List/search, detail, status PATCH + APIs.
10. **LINE push** — `packages/shared/src/line.ts` + `notification_log`; trigger on parcel/pickup status changes where applicable.
11. **User Menu 2 — Parcel list** — Parcel list page + `GET /api/parcels`.
12. **User Menu 5 — Pickup booking** — Slot picker; `GET /api/pickup/slots`; `POST /api/pickup` with DB transaction + `FOR UPDATE` on `pickup_slots`.
13. **Admin — Pickup management** — Pickup list confirm/cancel; slot CRUD pages + APIs.
14. **Admin — Dashboard** — Stats overview (parcels, pickups, pending).
15. **Admin — Cron ping** — `apps/admin/vercel.json` cron `0 9 */3 * *` + `GET /api/cron/ping` hitting Supabase.

## Infra checklist (optional tasks)

16. **Supabase setup** — Singapore project; pooler 6543 URL; API keys; RLS with `service_role` full access initially; first admin user in Auth dashboard.
17. **Vercel** — Two projects (`apps/user`, `apps/admin`); env vars; LIFF endpoint + LINE Login callback URLs.
