# Late-Payment Penalty & Outstanding-Balance — Design Spec

**Status:** Draft (proposed)
**Author:** brainstormed with the user, 2026-04-25
**Source-of-truth:** this file. Implementation plan will live alongside in `docs/superpowers/plans/`.

---

## 1. Problem

Beam-issued PromptPay QRs cannot be revoked once handed to the customer. A customer can save the original ฿100 QR on their phone and pay it days later. We can't pull it back, and Beam will still confirm the charge.

Today the system treats `parcels.is_paid = true` as terminal once the webhook lands, regardless of how late the payment was. We need a way to:

1. **Charge a penalty** for late payment (tiered, percentage of base price).
2. **Accept the late payment** that arrives via the original QR — but treat it as a **partial settlement** if penalties have accrued, with a remaining balance the customer must pay via a fresh QR.
3. **Auto-cancel parcels** that are abandoned (no payment at all within a defined window after the penalty clock starts).
4. **Make all of this derivable** from a small number of stored timestamps + amounts, so we don't have to materialize tier transitions or run timers.

A future Smartpost integration will tell us when the parcel was actually shipped to the customer (currently planned: a webhook from Smartpost). That event — not draft creation — is what should anchor the penalty clock. Until that webhook is built, the penalty system must coexist with `penalty_clock_started_at` always being NULL (i.e., no penalty is ever charged).

## 2. Goals & non-goals

**Goals**
- Tiered penalty (50% / 100% / 200% of base price) keyed off a single timestamp on `parcels`.
- Late partial payment freezes the bill (no further escalation) and surfaces a remaining-balance QR on the same `/pay/[parcelId]` route.
- Auto-cancel parcels at 24 hours after the penalty clock starts when `amount_paid = 0`.
- Schema and code are forward-compatible with the Smartpost shipped-webhook (which sets `penalty_clock_started_at`).
- All penalty state is derived from immutable stored facts (`price`, `penalty_clock_started_at`, succeeded `payments` rows, `now`). No timer, no scheduled tier-transition jobs.

**Non-goals (designed later)**
- The Smartpost shipped-webhook itself.
- Notification touchpoints (LINE flex push when tier jumps, when at risk of abandonment, when settled).
- Admin / staff UI for viewing penalty state, manual reconciliation, refunds.
- Cron scheduler config (we ship the sweep *endpoint*; you wire your cron when ready).
- Multi-currency. THB only.

## 3. Tier schedule

The clock starts at `parcels.penalty_clock_started_at`. Lateness `Δ = now - penalty_clock_started_at` (minutes).

| Bucket | `Δ` (minutes) | Penalty multiplier | Total owed (for ฿100 base) |
|---|---|---|---|
| Grace | `0 ≤ Δ < 30` | 0% | ฿100 |
| Tier 1 | `30 ≤ Δ < 240` | +50% of base | ฿150 |
| Tier 2 | `240 ≤ Δ < 960` | +100% of base | ฿200 |
| Tier 3 | `Δ ≥ 960` | +200% of base | ฿300 |

- The penalty is a **step function** (jumps at the boundary), not a gradient.
- Penalty is computed against `parcels.price` (the base), not compounded against prior tiers.
- Tier 3 (200%) is the maximum. After 960 minutes (16 h), penalty does not escalate further.
- **Abandonment cutoff:** `Δ = 24 h = 1440 min`. If at that moment `amount_paid = 0`, parcel auto-cancels (see §6.4). If `amount_paid > 0`, abandonment is irrelevant (clock is frozen — see §3.2).

The schedule lives in code as a single ordered constant:

```ts
// packages/shared/src/penalty.ts
export const PENALTY_TIERS = [
  { startMinutes: 0,    multiplier: 0.0 },
  { startMinutes: 30,   multiplier: 0.5 },
  { startMinutes: 240,  multiplier: 1.0 },
  { startMinutes: 960,  multiplier: 2.0 },
] as const;
export const ABANDON_AFTER_MINUTES = 24 * 60;
```

Changing the schedule is a one-file edit + one DB migration if any boundary or multiplier changes; consumers re-derive on next request.

### 3.1 Clock not started

If `penalty_clock_started_at IS NULL`, no penalty applies. `totalOwed = price`, `outstanding = price - amount_paid`. The `/pay/[parcelId]` UI shows base price only and a banner *"ค่าปรับยังไม่เริ่มคิด — เริ่มคิดเมื่อพัสดุถูกจัดส่ง"* (see §7).

### 3.2 Freeze-on-partial-payment

Once `amount_paid > 0`, the penalty clock is **frozen** at the tier in effect at the moment of the *first* succeeded payment. Subsequent reads use that frozen tier regardless of how much later they happen.

The "first succeeded payment timestamp" is `MIN(payments.paid_at WHERE parcel_id=? AND status='succeeded')`. We do not store this separately — it's derived on read.

### 3.3 No fallback if Smartpost webhook never fires

If `penalty_clock_started_at` is never set (carrier abandons, Smartpost integration breaks, etc.), no penalty is ever charged. This is intentional. We do not implement a "draft-time + N hours" fallback. If revenue leakage from this becomes a problem, the right fix is to make the Smartpost integration more reliable, not to compensate at the penalty layer.

## 4. Schema changes

### 4.1 `parcels` table — two new columns

```sql
ALTER TABLE parcels
  ADD COLUMN penalty_clock_started_at timestamptz,
  ADD COLUMN amount_paid numeric(14, 2) NOT NULL DEFAULT 0;
```

- `penalty_clock_started_at`: set to `now()` exactly once, by the future Smartpost shipped-webhook. Idempotent: if already set, the webhook leaves it alone.
- `amount_paid`: maintained by a **DB trigger** (see §4.3). Equal at all times to `SUM(payments.amount) WHERE parcel_id=parcels.id AND status='succeeded'`.

Drizzle schema mirrors:

```ts
// packages/shared/src/db/schema.ts (parcels)
penaltyClockStartedAt: timestamp("penalty_clock_started_at", { withTimezone: true }),
amountPaid: numeric("amount_paid", { precision: 14, scale: 2 }).notNull().default("0"),
```

### 4.2 No new tables

No `parcel_penalty_events`, no snapshot column. All penalty state is derived (§5).

### 4.3 Trigger maintaining `parcels.amount_paid`

The invariant `parcels.amount_paid = SUM(payments.amount WHERE status='succeeded')` is encoded in the database, not in `markPaymentSucceeded`. This protects against:

- A future admin tool inserting a `payments` row directly.
- A manual SQL fix-up.
- A new code path forgetting to update the column.

```sql
-- packages/shared/sql/20260425_amount_paid_trigger.sql
CREATE OR REPLACE FUNCTION refresh_parcel_amount_paid()
RETURNS TRIGGER AS $$
DECLARE
  affected_parcel uuid;
BEGIN
  affected_parcel := COALESCE(NEW.parcel_id, OLD.parcel_id);
  UPDATE parcels p
     SET amount_paid = COALESCE((
       SELECT SUM(amount)
         FROM payments
        WHERE parcel_id = affected_parcel
          AND status = 'succeeded'
     ), 0)
   WHERE p.id = affected_parcel;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payments_refresh_parcel_amount
AFTER INSERT OR UPDATE OF status, amount OR DELETE ON payments
FOR EACH ROW EXECUTE FUNCTION refresh_parcel_amount_paid();
```

Drizzle has no first-class trigger support, so we ship this as raw SQL in `packages/shared/sql/` alongside the existing migration files. A `README.md` line in that directory documents the invariant and its enforcement.

`markPaymentSucceeded` does **not** increment `amount_paid` itself — the trigger does it for free. Less code, no drift.

### 4.4 Indices

```sql
-- For sweep query (§6.4): finds parcels eligible for auto-cancel
CREATE INDEX IF NOT EXISTS parcels_penalty_sweep_idx
  ON parcels (penalty_clock_started_at)
  WHERE amount_paid = 0 AND status NOT IN ('paid', 'canceled');
```

A partial index keeps it tiny.

## 5. The pure derivation function

```ts
// packages/shared/src/penalty.ts

export type OutstandingState =
  | "clock_not_started"
  | "active"
  | "frozen"
  | "abandoned"
  | "settled";

export type Outstanding = {
  state: OutstandingState;
  /** Base + penalty, in major THB (number, not string). */
  totalOwed: number;
  /** max(0, totalOwed - amountPaid). */
  outstanding: number;
  /** The currently-applicable tier; null if clock not started. */
  currentTier: { startMinutes: number; multiplier: number } | null;
  /** The next tier above the current; null if at top tier or frozen. */
  nextTier: { startMinutes: number; multiplier: number } | null;
  /** Wall-clock when the next jump happens; null if frozen / clock not started / at top. */
  nextTierAt: Date | null;
  /** Wall-clock when auto-cancel triggers; null if frozen / clock not started. */
  abandonAt: Date | null;
  /** True if a partial payment has frozen the bill. */
  frozen: boolean;
};

export function computeOutstanding(args: {
  price: string;                // numeric, e.g. "100.00"
  penaltyClockStartedAt: Date | null;
  amountPaid: string;           // numeric, e.g. "0.00" or "100.00"
  firstSuccessfulPaymentAt: Date | null;
  now: Date;
}): Outstanding;
```

Behavior:

| Condition | `state` | Notes |
|---|---|---|
| `outstanding ≤ 0` | `settled` | Even with a clock, if fully paid, we're done. |
| `penaltyClockStartedAt == null` | `clock_not_started` | `totalOwed = price`. |
| `amountPaid > 0` (and `firstSuccessfulPaymentAt` set) | `frozen` | Tier picked from `firstSuccessfulPaymentAt - penaltyClockStartedAt`. |
| `now - penaltyClockStartedAt ≥ 24h` AND `amountPaid = 0` | `abandoned` | Sweep will cancel; UI shows abandoned card. |
| Otherwise | `active` | Tier picked from `now - penaltyClockStartedAt`. |

`currentTier` is found by scanning `PENALTY_TIERS` for the largest `startMinutes ≤ Δ`. `nextTier` is the entry above (or `null` if at top). `nextTierAt = penaltyClockStartedAt + nextTier.startMinutes` minutes. `abandonAt = penaltyClockStartedAt + 24h` (only meaningful while `active`).

The function is **pure** — same inputs, same output, no DB access. Easy to test (we don't have a test runner; verification is the manual walkthrough in the implementation plan).

## 6. Wiring

### 6.1 `markPaymentSucceeded` (existing, packages/shared/src/beam.ts)

No code change required — the trigger maintains `amount_paid` automatically. Continue to flip `payments.status` to `succeeded` and `parcels.is_paid = true, status = 'paid'` only when the parcel is **fully** settled.

**Change to existing logic:** today, `markPaymentSucceeded` unconditionally sets `parcels.is_paid = true, status = 'paid'`. With penalties, that's wrong if it's a partial settlement. New rule: after writing `payments`, re-read the parcel (now reflecting the trigger's update of `amount_paid`), compute `outstanding`, and:

- `outstanding == 0` ⇒ `parcels.is_paid = true, status = 'paid'` (existing behavior).
- `outstanding > 0` ⇒ leave `parcels.is_paid = false, status = 'pending_payment'`. The customer still owes money.

Both branches are inside the same DB transaction.

### 6.2 `POST /api/payment/charges` (existing)

Changes:

1. Replace "is parcel already paid?" guard with "is `outstanding` already zero?". The body of the check uses `computeOutstanding`.
2. The Beam charge amount is `outstanding`, not `parcel.price`. So if the customer has paid ฿100 against a ฿200 frozen total, the new QR is for ฿100.
3. **Reject creation when `state == 'abandoned'`** — return `{ ok: false, error: 'Parcel canceled due to abandonment' }, 410 Gone`.
4. Continue to resume an existing non-expired pending row with the same idempotency rules. (If the customer started a new charge for the remainder and refresh, they should see the same QR.)

### 6.3 `GET /api/payment/charges/[id]` (existing)

Add the full `Outstanding` object alongside the existing fields:

```ts
{
  ok: true,
  data: {
    paymentId, status, amount, currency, qrPayload, expiresAt, paidAt,
    parcelId, trackingId,
    // NEW:
    outstanding: {
      state, totalOwed, outstanding, currentTier, nextTier,
      nextTierAt, abandonAt, frozen,
    },
  },
}
```

The page uses this to render the tier schedule, the countdown to next jump, the frozen banner, etc. (§7).

### 6.4 `POST /api/payment/sweep-abandoned` (new)

```ts
POST /api/payment/sweep-abandoned
Header: X-Cron-Token: <process.env.CRON_SECRET>

Response 200:
{
  ok: true,
  sweptAt: "2026-04-25T14:00:00Z",
  canceledCount: 3,
  canceled: [
    {
      parcelId: "uuid",
      trackingId: "TH123",
      priceBaseTHB: "100.00",
      penaltyClockStartedAt: "2026-04-24T14:00:00Z",
    }
    // ...
  ],
}

Response 401: missing or wrong X-Cron-Token.
```

Behavior:

1. Verify `X-Cron-Token === process.env.CRON_SECRET`. Reject with 401 otherwise.
2. Single SQL: `UPDATE parcels SET status='canceled', updatedAt=now() WHERE penalty_clock_started_at IS NOT NULL AND penalty_clock_started_at < now() - interval '24 hours' AND amount_paid = 0 AND status NOT IN ('paid', 'canceled') RETURNING id, tracking_id, price, penalty_clock_started_at;`.
3. For each canceled row, also expire any pending `payments` row (`status = 'expired'`).
4. For each canceled row, write a `notification_log` entry with `type = 'parcel_auto_canceled'` and the parcel info as `payload`. (Reusing the existing table — no new schema. The future notification system will read these and dispatch LINE messages.)
5. Return the list.

Idempotent: re-running on the same parcels finds zero candidates (status is now `canceled`).

**No cron config in scope.** The endpoint is callable by any cron infra (Vercel cron, GitHub Actions, an external scheduler) provided it sends the secret header.

### 6.5 Smartpost shipped webhook (out of scope; documented contract)

When built later:

```ts
POST /api/smartpost/shipped
Body: { parcelId: string, shippedAt?: string /* ISO; defaults to now */ }

Effect: UPDATE parcels SET penalty_clock_started_at = COALESCE(shippedAt, now()) WHERE id = parcelId AND penalty_clock_started_at IS NULL;
```

The `IS NULL` guard makes it idempotent. No other code in the penalty system needs to change.

## 7. `/pay/[parcelId]` UI

### 7.1 Header amount

When `amountPaid = 0`:

> **ยอดที่ต้องชำระ** ฿X.XX
> หมายเลขพัสดุ: TH123

When `amountPaid > 0` (partial settlement, frozen):

> **ยอดคงเหลือ** ฿outstanding
> ชำระแล้ว ฿amountPaid · ยอดเต็ม ฿totalOwed
> หมายเลขพัสดุ: TH123

### 7.2 Tier schedule card (always visible)

A 4-row table showing the tier schedule with the active row highlighted. Always visible so customers know what's coming.

```
┌──────────────────────────────────────┐
│ ภายใน 30 นาที       ฿100   (ฟรี)     │
│ 30 นาที – 4 ชั่วโมง   ฿150   ◀ ปัจจุบัน │
│ 4 – 16 ชั่วโมง        ฿200             │
│ มากกว่า 16 ชั่วโมง    ฿300             │
└──────────────────────────────────────┘
   เพิ่มอีก ฿50 ใน 12:34 (ลบจาก nextTierAt − now)
```

### 7.3 Banner states

| `state` | Banner |
|---|---|
| `clock_not_started` | *"ค่าปรับยังไม่เริ่มคิด — เริ่มคิดเมื่อพัสดุถูกจัดส่ง"* (info, blue) |
| `active` | none — countdown is in §7.2 |
| `frozen` | *"ยอดถูกตรึงที่ ฿totalOwed เนื่องจากชำระบางส่วนแล้ว"* (info, slate) |
| `abandoned` | *"พัสดุถูกยกเลิกเนื่องจากไม่มีการชำระ"* (error, replaces QR) |
| `settled` | (existing success flash + redirect to `/send/success`) |

### 7.4 QR in frozen state

Identical flow to existing — `POST /api/payment/charges` for the parcel returns a QR for the `outstanding` amount; page renders it. The customer scans and pays the remainder. When that webhook lands and `outstanding = 0`, they redirect to `/send/success`.

## 8. Edge cases

1. **Concurrent partial + full payments.** All transitions are inside `markPaymentSucceeded`'s DB transaction. The trigger updates `amount_paid` atomically with the `payments` row write. The `outstanding == 0` check happens *after* the update; race is impossible.

2. **Stale QR for old amount paid late** (the original problem). Customer pays ฿100 against a saved QR while owing ฿200 (frozen at Tier 1). Webhook lands, `payments.status='succeeded'`, trigger sets `parcels.amount_paid = 100`. `markPaymentSucceeded` recomputes: `outstanding = 100`. Parcel stays in `pending_payment`. `/pay/[parcelId]` (which the customer is presumably *not* looking at, but the system is correct anyway) shows ฿100 outstanding and a "create new QR" affordance. The customer is then prompted (out-of-scope notification) to pay ฿100 more.

3. **Webhook arrives after auto-cancel.** Sweep cancels at hour 24 with `amount_paid = 0`. At hour 26, the original ฿100 webhook lands. `markPaymentSucceeded` writes `payments.status='succeeded'`; trigger sets `amount_paid = 100`. **Parcel does not auto-uncancel.** Staff manually reconciles via the future admin UI. The customer's money is recorded and refundable. We log a warning in the webhook handler when the parcel is already canceled. (This case should be rare — sweeping is at 24h and Beam payments are usually instantaneous.)

4. **Sweep races a payment.** Sweep query reads parcels with `amount_paid = 0`, then UPDATEs them. If a payment lands between the read and the write, the row's `amount_paid` is now > 0, but the sweep's UPDATE doesn't filter on that — it would cancel the parcel anyway. Fix: include `amount_paid = 0` in the UPDATE's WHERE clause, not just the SELECT. Postgres will re-check on the row lock, and the cancel will be a no-op for rows that gained payment in the meantime.

5. **Timezone correctness.** All `timestamptz` columns. `Date.now()` and `new Date()` operate in UTC under the hood. UI countdowns operate on `Date` objects directly; rendering uses `toLocaleString` on the client. No time math in `/Bangkok` — only display.

6. **Tier schedule changes after the fact.** If we change `PENALTY_TIERS` constants (e.g., make Tier 1 60% instead of 50%), it applies to all parcels — existing pending charges retroactively get the new schedule. This is acceptable for an internal tool; if it ever becomes a customer-facing concern, snapshot the schedule into the parcel at clock-start. Not in scope for v1.

7. **Penalty on a ฿0 parcel.** Shouldn't happen (draft route enforces `price > 0`), but defensively: `totalOwed = 0`, `outstanding = -amountPaid` (clamped to 0), state = `settled`. Functional no-op.

## 9. Out of scope (will be designed later)

- Notification touchpoints (LINE flex pushes for tier transitions, abandonment warnings, settlement confirmations). Notification log entries will be written at the right moments so the future system has the data it needs.
- Smartpost shipped-webhook implementation. Contract is documented in §6.5; nothing else to coordinate.
- Admin / staff UI for: viewing penalty state, manual reconciliation of post-cancel webhook payments, refunds, manual penalty adjustment.
- Cron scheduler config for `/api/payment/sweep-abandoned`.
- Tier-snapshot-on-clock-start (per-parcel frozen schedule). Only worth designing if §8.6 becomes a real concern.
- Localization beyond Thai/THB.

## 10. File structure (anticipated)

**New files**
- `packages/shared/src/penalty.ts` — `PENALTY_TIERS`, `ABANDON_AFTER_MINUTES`, `computeOutstanding`, types.
- `packages/shared/sql/20260425_amount_paid_trigger.sql` — trigger + function.
- `packages/shared/sql/20260425_parcels_penalty_columns.sql` — `ALTER TABLE` for `penalty_clock_started_at`, `amount_paid`, partial index.
- `apps/user/app/api/payment/sweep-abandoned/route.ts` — sweep endpoint.

**Modified files**
- `packages/shared/src/db/schema.ts` — add the two columns to `parcels`.
- `packages/shared/package.json` — `./penalty` subpath export.
- `packages/shared/src/beam.ts` — `markPaymentSucceeded` now reads `outstanding` and conditionally flips `is_paid`/`status`.
- `apps/user/app/api/payment/charges/route.ts` — Beam amount = `outstanding`; reject when abandoned; new outstanding-already-zero guard.
- `apps/user/app/api/payment/charges/[id]/route.ts` — include `outstanding` in response.
- `apps/user/app/pay/[parcelId]/page.tsx` — header amount, tier schedule card, banners.
- `.env.example` — `CRON_SECRET=` (new).

**Untouched (called out)**
- `payments` table schema.
- `markPaymentSucceeded`'s transactional structure (only the post-update read + conditional changes).
- The Smartpost add-item flow.
- The webhook signature/HMAC code.

## 11. Self-review

- **Placeholders:** none. Every value (10 min grace, 30/240/960 min boundaries, 50/100/200% multipliers, 24h abandonment, ฿ amounts in examples) is concrete.
- **Internal consistency:** `markPaymentSucceeded`'s new behavior (§6.1) and the trigger (§4.3) are non-overlapping (trigger writes `amount_paid`, application code reads it after). Tier table referenced from §3 is the same constant referenced from §5. Abandonment rule is the same in §3 (24h cutoff), §6.4 (sweep query), §8.4 (race-handling).
- **Scope:** one self-contained change. Schema + one pure function + four route changes + UI. No multi-system coordination.
- **Ambiguity:** the only thing I caught is "tier 3 is the maximum" vs. "abandonment at 24h" — both are true and don't conflict (tier 3 caps the bill at 200%; abandonment terminates the parcel for non-payers, regardless of tier). Made explicit at end of §3.
