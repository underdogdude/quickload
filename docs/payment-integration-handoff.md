# Payment Integration — Developer Handoff

Branch: `feature/integrate-payment` · Base: `main`

This branch ships three layered features:
1. **Beam Checkout PromptPay** payment flow (`/pay/[parcelId]`).
2. **Late-payment penalty** (tiered 50% / 100% / 200%) with **outstanding-balance** flow.
3. **UX polish**: cancel actually cancels the order, list-page "ชำระเงิน" CTA, status pills.

The full design and plan live under `docs/superpowers/{specs,plans}/2026-04-25-*`. This file is the **operational** handoff — what to install, what to configure, what to run, in what order.

---

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 18 | Repo uses 22.x in dev. |
| pnpm | 9.14.2 | Pinned via `packageManager`. |
| Docker | any recent | Required only if using local Supabase via `pnpm supabase:start`. |
| Supabase CLI | latest | Required only for local Supabase. Install: `brew install supabase/tap/supabase`. |
| `psql` | — | **NOT required.** All migrations go through `pnpm` scripts. |

---

## 2. One-time setup

```bash
# 1. Install dependencies
pnpm install

# 2. Copy env template and fill in values
cp .env.example apps/user/.env.local
# then edit apps/user/.env.local — see §3 below
```

---

## 3. Required environment variables

Edit `apps/user/.env.local`. **Never commit it** — it's already in `.gitignore`.

```bash
# Database — pick ONE
# Option A: hosted Supabase (production-like)
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres

# Option B: local Supabase (Docker; ports 5532x — see .env.example)
# DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres

# Iron-session cookie key (≥32 chars)
IRON_SESSION_PASSWORD=<generate a long random string>

# LINE LIFF login
NEXT_PUBLIC_LIFF_ID=<your LIFF id>
LINE_CHANNEL_SECRET=<from LINE Developers>
LINE_CHANNEL_ACCESS_TOKEN=<from LINE Developers>

# Beam Checkout (playground for sandbox; production URL for live)
BEAM_API_BASE_URL=https://playground.api.beamcheckout.com
BEAM_MERCHANT_ID=<from Beam Lighthouse playground>
BEAM_API_KEY=<from Beam Lighthouse playground>
BEAM_WEBHOOK_HMAC_KEY=<from Beam Lighthouse playground>

# Cron secret for /api/payment/sweep-abandoned (long random string)
CRON_SECRET=<long random string>

# Dev-only conveniences (leave UNSET in staging/production)
NEXT_PUBLIC_PAYMENT_MOCK=1     # renders the "[DEV] simulate paid" button on /pay
NEXT_PUBLIC_SMARTPOST_MOCK=1   # bypass Smartpost addItem + pricing/estimate calls
NEXT_PUBLIC_DEV_SKIP_LINE_AUTH=  # leave empty
```

---

## 4. Local Supabase (skip if using hosted)

```bash
pnpm supabase:start          # starts Postgres + Studio in Docker (~30s)
pnpm supabase:status         # see ports + keys
pnpm supabase:stop           # stop containers when done
```

After `start`, the local Studio is at <http://127.0.0.1:55323>. Set `DATABASE_URL` in `apps/user/.env.local` to the printed value (Postgres on port `55322`).

---

## 5. Apply database migrations (no psql required)

The repo includes a `pnpm`-based SQL runner that uses the existing `postgres` npm dep. **You do not need `psql` installed.**

The payment + penalty stack consists of three SQL files. Apply them in dependency order:

```bash
# One command — applies all three migrations in the right order
pnpm db:apply:payment-stack
```

This runs:
1. `packages/shared/sql/20260425_payments.sql` — creates `payments` table + indexes.
2. `packages/shared/sql/20260425_parcels_penalty_columns.sql` — adds `penalty_clock_started_at` and `amount_paid` to `parcels`, plus a partial sweep index.
3. `packages/shared/sql/20260425_amount_paid_trigger.sql` — creates the trigger that maintains `parcels.amount_paid = SUM(succeeded payments)` automatically.
4. `packages/shared/sql/20260426_payments_one_pending_per_parcel.sql` — partial unique index that blocks duplicate pending payments per parcel (prevents the React-StrictMode double-mount race).

**All three are idempotent** (use `IF NOT EXISTS` / `CREATE OR REPLACE`); safe to re-run.

You can also apply individually:

```bash
pnpm --filter @quickload/shared db:apply:payments
pnpm --filter @quickload/shared db:apply:penalty-columns
pnpm --filter @quickload/shared db:apply:amount-paid-trigger
```

The runner reads `DATABASE_URL` from these locations in order (first hit wins):
1. `apps/user/.env.local`
2. `apps/user/.env`
3. `packages/shared/.env`
4. `process.env`

### Other useful migration commands

```bash
# Push the Drizzle schema (does NOT include the trigger — apply separately as above).
# May fail with a drizzle-kit introspection bug on Supabase auth tables; if so,
# fall back to pnpm db:apply:* commands which use raw SQL.
pnpm db:push

# Generate Drizzle migrations (rarely needed; we hand-write SQL files in
# packages/shared/sql/ to keep the trigger and indexes versioned).
pnpm db:generate

# Open Drizzle Studio in the browser
pnpm db:studio
```

### Verifying the migrations landed

Open Supabase Studio → Table Editor and confirm:
- `payments` table exists with 17 columns (`id`, `parcel_id`, `provider_charge_id`, etc.)
- `parcels` table now has `penalty_clock_started_at` and `amount_paid` columns
- Database → Triggers shows `payments_refresh_parcel_amount` on the `payments` table

---

## 6. Run the app

```bash
# Dev server (apps/user) — Next.js on :3020
pnpm dev:user

# Or all turbo apps
pnpm dev

# Public ngrok tunnel (needed for Beam webhook delivery in real sandbox tests)
pnpm tunnel:user
```

The app is at <http://localhost:3020>. LIFF login is required by default; for local dev without LINE setup, set `NEXT_PUBLIC_DEV_SKIP_LINE_AUTH=1` in `apps/user/.env.local`.

---

## 7. End-to-end manual test (dev-simulate path)

This walks the happy path without needing real Beam credentials beyond what makes the create-charge call work.

1. Set in `apps/user/.env.local`:
   ```
   NEXT_PUBLIC_PAYMENT_MOCK=1
   NEXT_PUBLIC_SMARTPOST_MOCK=1
   ```
2. Restart `pnpm dev:user`.
3. Navigate to `/send`, fill in a parcel, hit "ถัดไป".
4. On `/send/review`, click "ยืนยันสร้างออเดอร์".
5. You land on `/pay/{uuid}` with a real Beam-issued PromptPay QR and a 10:00 countdown.
6. Click the amber `[DEV] จำลองการชำระสำเร็จ` button.
7. Page flashes "ชำระเงินสำเร็จ" and redirects to `/send/success`.
8. Verify in Supabase Studio:
   - `payments.status='succeeded'`, `paid_at` recent.
   - `parcels.status='paid'`, `is_paid=true`, `amount_paid` matches the QR amount.

For the late-payment + outstanding-balance scenarios, see `docs/superpowers/plans/2026-04-25-late-payment-penalty.md` Task 14 — that walks the partial-stale-QR test, the abandonment sweep, and the sweep race.

---

## 8. Cron-callable endpoints

`/api/payment/sweep-abandoned` cancels parcels whose penalty clock started >24h ago with no payment.

```bash
# Trigger manually (for testing)
curl -X POST http://localhost:3020/api/payment/sweep-abandoned \
  -H "X-Cron-Token: $(grep CRON_SECRET apps/user/.env.local | cut -d= -f2)"
```

In production, wire this to your cron infra (Vercel Cron, GitHub Actions, an external scheduler). It must send the `X-Cron-Token` header. **Cron config is not in this branch — set it up separately.**

---

## 9. What's not yet done (handoff TODOs)

- **Smartpost shipped-webhook** that sets `parcels.penalty_clock_started_at`. Until this exists, no parcel ever accrues a penalty. Contract: `POST /api/smartpost/shipped { parcelId }` → `UPDATE parcels SET penalty_clock_started_at = now() WHERE id = $1 AND penalty_clock_started_at IS NULL;`.
- **Cron schedule** for `/api/payment/sweep-abandoned` (recommended: every 5–15 min).
- **LINE notifications** for tier transitions, abandonment warnings, and settlement confirmations. The sweep already writes to `notification_log` so the data is there for whatever notification dispatcher you build.
- **Admin/staff UI** for: viewing penalty state, manual reconciliation when a webhook arrives after auto-cancel, refunds, manual penalty adjustment.
- **End-to-end manual verification with live Beam playground + DB**. Code is type-clean and reviewer-approved, but no human has walked the full flow against real Beam yet.

---

## 10. Quick reference — full command list

```bash
# Install
pnpm install

# Local DB (optional)
pnpm supabase:start
pnpm supabase:status
pnpm supabase:stop

# Migrations (no psql required)
pnpm db:apply:payment-stack                       # all four in order
pnpm --filter @quickload/shared db:apply:payments
pnpm --filter @quickload/shared db:apply:penalty-columns
pnpm --filter @quickload/shared db:apply:amount-paid-trigger
pnpm --filter @quickload/shared db:apply:one-pending-idx
pnpm db:push                                       # Drizzle schema sync (skips trigger)
pnpm db:studio                                     # Drizzle Studio

# Dev
pnpm dev:user                                      # Next.js on :3020
pnpm dev                                           # all turbo apps
pnpm tunnel:user                                   # ngrok for webhook tests

# Build / lint
pnpm build
pnpm lint

# Type-check (no test runner; this is the gate)
pnpm -C packages/shared exec tsc --noEmit
pnpm -C apps/user exec tsc --noEmit

# Manual sweep trigger
curl -X POST http://localhost:3020/api/payment/sweep-abandoned \
  -H "X-Cron-Token: <your-CRON_SECRET-value>"
```

---

## 11. Reference docs

- `docs/superpowers/specs/2026-04-25-beam-payment-integration-design.md`
- `docs/superpowers/plans/2026-04-25-beam-payment-integration.md`
- `docs/superpowers/specs/2026-04-25-late-payment-penalty-design.md`
- `docs/superpowers/plans/2026-04-25-late-payment-penalty.md`
