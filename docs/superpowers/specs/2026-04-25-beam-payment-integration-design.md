# Beam Checkout Payment Integration — Design

**Date:** 2026-04-25
**Branch:** `feature/integrate-payment`
**Status:** Draft — awaiting user review

## Summary

Add a PromptPay payment step to the parcel send flow. On `/send/review`, after clicking "ยืนยันสร้างออเดอร์", the user is taken to a new in-app payment screen `/pay/[parcelId]` that renders a PromptPay QR code obtained from Beam Checkout's Charges API. The user pays with their banking app; Beam sends a signed webhook to our server; our server flips the parcel to paid and the client (polling every 2.5s) auto-advances to `/send/success`.

The payment unit is a self-contained first-class route plus its API endpoints, so it can later be triggered from other places (e.g. `/payment`, parcel detail page) without touching its code.

## Scope

### In scope
- New `payments` table (Drizzle).
- New route `/pay/[parcelId]`.
- New API routes under `/api/payment/` (charge create, status poll, webhook receiver, dev-simulate, cancel).
- New shared Beam client module in `packages/shared/src/beam.ts`.
- Minimal edit to `POST /api/parcels/draft` to write `price` and `status='pending_payment'`.
- Minimal edit to `/send/review` to redirect to `/pay/[parcelId]` after draft creation.
- Real Beam sandbox integration (`https://playground.api.beamcheckout.com`) plus a dev-only "simulate paid" button that routes through the same internal function as the real webhook handler.
- Env vars and manual test checklist.

### Out of scope
- Smartpost add-item changes. The existing `/send/review` sequence (add-item → draft) is untouched. Add-item being unreachable from localhost is a pre-existing condition, not addressed here.
- Refunds UI/API.
- Admin app changes.
- LINE push on payment success.
- Automated test runner setup (no `vitest`/`jest` in the repo today). Verification is the manual checklist.
- Expiry sweep cron for stuck `pending` rows.
- Extracting the payment flow to a different UI entry point — that's the follow-up work that motivated the "reusable unit" requirement; this spec just makes the unit reusable.

## Architecture

Three layers:

**Shared (`packages/shared/src/beam.ts`)**
- `createBeamPromptPayCharge({ amount, currency, referenceId, idempotencyKey })` — POSTs to Beam Charges API, returns `{ chargeId, qrPayload, expiresAt, rawResponse }`.
- `verifyBeamWebhookSignature(rawBody, signatureHeader)` — HMAC-SHA256 verification per Beam's docs.
- `markPaymentSucceeded({ providerChargeId, rawWebhookPayload })` — the single function both the real webhook and the dev-simulate route call.
- Base URL from `BEAM_API_BASE_URL` env; Basic Auth from `BEAM_MERCHANT_ID` + `BEAM_API_KEY`.

**Data**
- New `payments` table (schema below).
- `parcels.price` starts being written at draft creation.
- `parcels.status` gains a new value `"pending_payment"` (set at draft) and `"paid"` (set on webhook success). Existing `"registered"` stays for non-payment flows. Column is `text`, no enum change needed.

**App (`apps/user`)**
- `app/pay/[parcelId]/page.tsx` — client component; renders QR, amount, countdown, polls status, handles all states.
- `app/api/payment/charges/route.ts` — `POST` create/resume charge.
- `app/api/payment/charges/[id]/route.ts` — `GET` status; `POST` to `/cancel` sub-route for cancel.
- `app/api/payment/beam-webhook/route.ts` — `POST` webhook receiver; HMAC-authenticated.
- `app/api/payment/dev-simulate/[id]/route.ts` — `POST` dev shortcut; `404` in production.

### Data flow (happy path)

1. User on `/send/review` taps "ยืนยันสร้างออเดอร์".
2. Existing code: `POST /api/smartpost/add-item` → `POST /api/parcels/draft`. The draft endpoint now also writes `price` and `status='pending_payment'`.
3. Client redirects to `/pay/{parcelId}` instead of `/send/success`.
4. Page mounts; calls `POST /api/payment/charges { parcelId }`. Server validates ownership, re-reads `parcel.price`, calls Beam, inserts `payments` row with `qrPayload`, `expiresAt = now() + 10min`, `status='pending'`.
5. Page renders QR + countdown; starts polling `GET /api/payment/charges/{paymentId}` every 2.5s.
6. User pays with banking app; Beam sends `charge.succeeded` webhook to `POST /api/payment/beam-webhook`.
7. Handler verifies HMAC signature on the raw body; calls `markPaymentSucceeded(chargeId)`, which in one transaction sets `payments.status='succeeded'` + flips `parcels.isPaid=true, status='paid'`.
8. Next poll returns `succeeded`; client redirects to `/send/success?parcelId=...&trackingId=...`.

### Reusability contract

`/pay/[parcelId]` and the API routes take only a parcel id. Preconditions: parcel exists, belongs to the caller, `isPaid=false`, `price > 0`. Any future entry point (account balance page, parcel detail page, etc.) just links/navigates to `/pay/{parcelId}`; no `/send/review`-specific code lives in the payment unit.

## Data model

### New table: `payments`

```ts
// packages/shared/src/db/schema.ts
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  parcelId: uuid("parcel_id")
    .notNull()
    .references(() => parcels.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id),
  provider: text("provider").notNull().default("beam"),
  providerChargeId: text("provider_charge_id").unique(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("THB"),
  paymentMethod: text("payment_method").notNull().default("promptpay"),
  status: text("status").notNull().default("pending"),
  //   'pending' | 'succeeded' | 'failed' | 'expired' | 'canceled'
  qrPayload: text("qr_payload"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  rawCreateResponse: jsonb("raw_create_response"),
  rawWebhookPayload: jsonb("raw_webhook_payload"),
  idempotencyKey: text("idempotency_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});
```

**Indexes**
- `provider_charge_id` unique (declared above).
- `(parcel_id, status)` — lookup "live payment for this parcel".
- `(status, expires_at)` — supports future sweep job; cheap to add now.

**Design notes**
- `providerChargeId` nullable so we tolerate insert-then-update ordering cleanly; in practice we set it in the same insert.
- Stored `qrPayload` enables idempotent resume on refresh — the page returns the existing QR, never creates a duplicate charge.
- `rawCreateResponse` / `rawWebhookPayload` preserve full Beam payloads for debugging; Beam wire format may change.
- `idempotencyKey` prevents duplicate Beam charges on double-create.
- One-parcel-many-payments supports retry after expire/fail; history preserved.

### `parcels` changes

No schema change. The existing `price` column starts being populated by `POST /api/parcels/draft`. `status` gains two conventional values (`"pending_payment"`, `"paid"`) — column is already `text`.

**Invariants**
- At most one `payments` row per parcel has `status='pending'`. Enforced by: create-charge endpoint expires stale pending rows before inserting a new one, within a single DB transaction.
- A parcel never has `isPaid=true` without a `payments.status='succeeded'` row. Enforced by: only `markPaymentSucceeded()` flips `isPaid`, and it does both updates in one transaction.

### Migration

Drizzle Kit — run `pnpm db:push` after adding the schema. No data backfill; existing parcels keep `price=null` and their existing `status`.

## API contracts

All routes return `{ ok: true, data: ... }` on success and `{ ok: false, error: string }` on failure, matching the repo's existing convention.

### `POST /api/payment/charges`

Create or resume a charge for a parcel.

**Request**
```json
{ "parcelId": "uuid" }
```

**Server logic**
1. `requireLineSession()` → `userId`.
2. Load parcel. Assert `parcel.userId === userId`, `parcel.isPaid === false`, `parcel.price > 0`.
3. Look for existing `payments` row for this parcel with `status='pending'` and `expiresAt > now()`. If found → return it (idempotent resume).
4. Otherwise, update any stale pending rows for this parcel to `status='expired'`.
5. `idempotencyKey = crypto.randomUUID()`.
6. Call `createBeamPromptPayCharge({ amount: parcel.price, currency: "THB", referenceId: parcel.id, idempotencyKey })`.
7. Insert `payments` row with `status='pending'`, `providerChargeId`, `qrPayload`, `expiresAt = min(now() + 10min, Beam's expiry if provided)`, `rawCreateResponse`.
8. Return the payment.

**Response**
```json
{ "ok": true, "data": {
    "paymentId": "uuid",
    "amount": "85.00",
    "currency": "THB",
    "qrPayload": "00020101...",
    "expiresAt": "2026-04-25T10:30:00Z",
    "status": "pending"
} }
```

**Errors**: `400` (parcel already paid / no price / not owner), `502` (Beam unreachable), `500` otherwise.

### `GET /api/payment/charges/[id]`

Status poll.

**Server logic**
1. `requireLineSession()`.
2. Load payment; assert its parcel belongs to the caller.
3. If `status='pending'` and `expiresAt < now()`, flip to `'expired'` before returning.
4. Return current state.

**Response**
```json
{ "ok": true, "data": {
    "paymentId": "uuid",
    "status": "pending" | "succeeded" | "failed" | "expired" | "canceled",
    "amount": "85.00",
    "currency": "THB",
    "qrPayload": "00020101...",
    "expiresAt": "2026-04-25T10:30:00Z",
    "paidAt": "2026-04-25T10:27:12Z",
    "parcelId": "uuid",
    "trackingId": "WB12345TH"
} }
```

`trackingId` included so the client can build the `/send/success` redirect without a second request.

### `POST /api/payment/charges/[id]/cancel`

**Server logic**
1. `requireLineSession()`, assert ownership.
2. Only acts on `status='pending'`; sets it to `'canceled'`.
3. Does not call Beam — sandbox charges can age out; no harm.

**Response**: `{ ok: true }`.

### `POST /api/payment/beam-webhook`

Beam webhook receiver. No session; auth is HMAC.

**Server logic**
1. Read **raw** body (`await req.text()` before parsing — signature depends on exact bytes).
2. `verifyBeamWebhookSignature(rawBody, req.headers.get('x-beam-signature'))`. Reject with `401` on mismatch.
3. Read `x-beam-event`. Act on `charge.succeeded`; log-and-200 for others.
4. Parse body; extract `chargeId`.
5. Call `markPaymentSucceeded({ providerChargeId: chargeId, rawWebhookPayload })`.
6. Return `200` always once signature verifies (including for unknown / already-succeeded rows — idempotent).

`markPaymentSucceeded()` in one DB transaction:
- `UPDATE payments SET status='succeeded', paid_at=now(), raw_webhook_payload=$1 WHERE provider_charge_id=$2 AND status='pending'`.
- If row updated: `UPDATE parcels SET is_paid=true, status='paid' WHERE id=payment.parcel_id`.
- If no row updated: no-op, return success.

### `POST /api/payment/dev-simulate/[id]`

Dev-only shortcut. Zero code divergence from production — calls the same internal function as the webhook handler.

**Server logic**
1. If `process.env.NODE_ENV === 'production'` → `404`.
2. `requireLineSession()`, assert ownership.
3. Load payment; assert `status='pending'`.
4. Call `markPaymentSucceeded({ providerChargeId: payment.providerChargeId, rawWebhookPayload: { simulated: true } })`.
5. Return `{ ok: true }`.

### Edits to existing routes

`POST /api/parcels/draft`:
- Accept `price` in request body; write it to `parcels.price`.
- Write `parcels.status='pending_payment'` at creation.
- No other changes.

`/send/review` client code:
- Pass `baseEstimatedPrice` in the body of the existing `/api/parcels/draft` request.
- After draft creation returns `{ id, trackingId }`, redirect to `/pay/{id}` instead of `/send/success`.

## Payment screen UI (`/pay/[parcelId]`)

Client component (needs polling, timers, QR rendering). Visual language matches `/send/review`: blue `#2726F5` header, slate-100 bg, `max-w-lg` card stack, fixed bottom action bar.

### Layout

```
┌─────────────────────────────────┐
│  [← back]                        │ ← blue header
│  ชำระเงิน                         │
│  สแกน QR ด้วยแอปธนาคารของคุณ    │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│    ยอดที่ต้องชำระ                 │
│    ฿ 85.00                       │
│    หมายเลขพัสดุ: WB12345TH        │
│                                   │
│    ┌───────────────┐              │
│    │  [QR CODE]    │              │
│    └───────────────┘              │
│    PromptPay                      │
│                                   │
│    เหลือเวลา 09:47                │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│  [ยกเลิก]                        │ ← fixed bottom
└─────────────────────────────────┘
```

### QR rendering

Beam returns a QR payload. We render via the existing `apps/user/lib/promptpay-qr-data-url.ts` helper (or an equivalent `qrcode` call if Beam's payload is already a base64 PNG — decided at implementation time from the actual response). The payload string is also shown small and selectable under the image for copy-paste users.

### State machine (client)

```
loading ──create charge──► pending ──poll──► succeeded ──► redirect /send/success
   │                          │
   │                          ├──poll──► failed ──► error card + "สร้าง QR ใหม่"
   │                          │
   │                          ├──timer──► expired ──► expired card + "สร้าง QR ใหม่"
   │                          │
   │                          └──user tap "ยกเลิก"──► canceled ──► /send/review
   │
   └── error on create ──► error card + retry / back
```

### Behavior

- On mount: `POST /api/payment/charges`. An existing pending row is returned as-is (no double charge on refresh).
- Poll every 2500ms while `pending` and not past `expiresAt`.
- Stop polling on `document.visibilitychange` to hidden; resume on focus.
- Countdown derived locally from `expiresAt`; expiry UI shows before the server-side flip arrives.
- On `succeeded`: stop polling, flash a brief "ชำระเงินสำเร็จ" (~300ms), redirect to `/send/success?parcelId=...&trackingId=...`.
- "ยกเลิก" button: calls `POST /api/payment/charges/{paymentId}/cancel`, then router back to `/send/review`.
- Expired / failed: render retry card with "สร้าง QR ใหม่" → `POST /api/payment/charges` again → new pending row.

### Dev-only "simulate paid" button

Rendered only when `process.env.NEXT_PUBLIC_PAYMENT_MOCK === "1"`. Amber styling, `[DEV]` prefix, below the QR. On click: `POST /api/payment/dev-simulate/{paymentId}`. Poll catches the transition within one tick.

### Deliberately not doing

- No manual "I paid" confirmation button (webhook is source of truth).
- No modal (route is first-class → reusable).
- No iframe (Beam forbids).

## Error handling & edge cases

**Beam API failures (create-charge time)**
- Unreachable / 5xx / timeout → `502`, no `payments` row inserted, client shows retry card.
- 4xx → log raw response, `500`, generic UI error.
- Beam's `expiresAt` in response (if present) beats our 10-min cap when sooner.

**Webhook failures**
- Bad signature → `401`. Beam will retry; persistent failures are a config issue.
- Unknown `providerChargeId` → `200` no-op.
- Already-succeeded row → `UPDATE ... WHERE status='pending'` matches 0 rows → `200`.
- `charge.failed` event (not MVP-required, but received): set `payments.status='failed'`; parcel stays unpaid; client's poll sees it and shows retry card.
- Webhook-before-create race: extremely unlikely (user must scan the QR that came back in the response). Accepted and logged; not over-engineered.

**Client failures**
- Poll network blip: swallow, keep polling.
- Page closed mid-payment: benign. User can reopen `/pay/{parcelId}` while row is `pending` and not expired — same QR.
- Page refreshed: idempotent resume returns same QR, same countdown.
- Browser back: goes to `/send/review`; parcel still exists as `pending_payment`, unpaid.

**Security posture**
- Amount server-computed from `parcel.price` every time; client-sent amount ignored on create.
- All payment API routes `requireLineSession()` and assert parcel ownership.
- Dev-simulate: hard `404` in production *and* requires session — two layers.
- Beam credentials server-only; never `NEXT_PUBLIC_*`.
- Raw webhook body HMAC-verified **before** parsing.

**Logging**
- `info` on charge create (`paymentId`, `parcelId`, `amount` — no secrets), webhook received (`event`, `chargeId`, `signatureValid`), `markPaymentSucceeded` completion.
- `error` on Beam failures and signature mismatches.
- Raw payloads preserved in jsonb columns.

## Env & config

Added to repo-root `.env.example` and `apps/user/.env.local`:

```
BEAM_API_BASE_URL=https://playground.api.beamcheckout.com
BEAM_MERCHANT_ID=
BEAM_API_KEY=
BEAM_WEBHOOK_HMAC_KEY=
NEXT_PUBLIC_PAYMENT_MOCK=
```

- `BEAM_API_BASE_URL`: `https://playground.api.beamcheckout.com` (sandbox) or `https://api.beamcheckout.com` (prod).
- `BEAM_MERCHANT_ID` + `BEAM_API_KEY`: Basic Auth pair.
- `BEAM_WEBHOOK_HMAC_KEY`: base64-encoded HMAC key from Beam Lighthouse.
- `NEXT_PUBLIC_PAYMENT_MOCK=1` shows the dev-simulate button. Unset in staging/prod.

No admin app or shared package env changes.

## Local development

1. Register Beam playground; get merchant ID, API key, webhook HMAC key; set in `apps/user/.env.local`.
2. `pnpm dev:user`.
3. **Inner loop (UI iteration)**: set `NEXT_PUBLIC_PAYMENT_MOCK=1`; use `[DEV] simulate paid` button — no tunnel needed.
4. **End-to-end sandbox**: `pnpm tunnel:user`, copy ngrok HTTPS URL, register `{url}/api/payment/beam-webhook` as the playground webhook in Beam Lighthouse, pay with Beam's sandbox PromptPay test data.

## Testing

The repo has no test runner today (no `vitest`/`jest` config, no `test` script). Adding one is out of scope. Verification is the manual checklist below.

### Happy path (dev simulate)
- [ ] `/send/review` → "ยืนยันสร้างออเดอร์" → lands on `/pay/{parcelId}` with QR and amount matching "ราคาพื้นฐาน".
- [ ] Click `[DEV] simulate paid` → within ~3s auto-redirects to `/send/success` with correct `parcelId` and `trackingId`.
- [ ] DB: `payments.status='succeeded'`, `paid_at` set; `parcels.isPaid=true`, `status='paid'`.

### Happy path (Beam sandbox + ngrok)
- [ ] Same as above but paying via Beam's test PromptPay. Identical DB end state.

### Resume / refresh
- [ ] Refresh `/pay/{parcelId}` while pending → same QR, same remaining countdown, no duplicate `payments` row.
- [ ] Close tab, reopen `/pay/{parcelId}` before expiry → same QR resumes.

### Expiry
- [ ] Let QR expire (or set `expires_at` in DB to past) → expired state with "สร้าง QR ใหม่" → clicking creates a new pending row; old row `expired`.

### Cancel
- [ ] Tap "ยกเลิก" → returns to `/send/review`; `payments.status='canceled'`; parcel stays `isPaid=false, status='pending_payment'`.

### Webhook robustness
- [ ] Bad signature → `401`, no DB change.
- [ ] Replay valid webhook twice → `200` both, no duplicate state changes.
- [ ] Unknown `chargeId` webhook → `200`, no DB change.

### Security / authorization
- [ ] User B cannot `GET /api/payment/charges/{A's paymentId}` → `403/404`.
- [ ] Tampered `price` in draft request body is ignored server-side.
- [ ] `NODE_ENV=production` + dev-simulate call → `404`.

## Files touched (preview)

**New**
- `packages/shared/src/beam.ts`
- `apps/user/app/pay/[parcelId]/page.tsx`
- `apps/user/app/api/payment/charges/route.ts`
- `apps/user/app/api/payment/charges/[id]/route.ts`
- `apps/user/app/api/payment/charges/[id]/cancel/route.ts`
- `apps/user/app/api/payment/beam-webhook/route.ts`
- `apps/user/app/api/payment/dev-simulate/[id]/route.ts`

**Modified**
- `packages/shared/src/db/schema.ts` — add `payments` table.
- `apps/user/app/api/parcels/draft/route.ts` — write `price`, `status='pending_payment'`.
- `apps/user/app/send/review/page.tsx` — pass `baseEstimatedPrice` to draft, redirect to `/pay/{id}`.
- `.env.example`, `apps/user/.env.local` — Beam env vars.

**Untouched**
- `/api/smartpost/add-item` call site.
- Admin app.
- Legacy payment balance endpoint (stays as-is for the `/payment` page).
