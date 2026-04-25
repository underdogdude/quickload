# Late-Payment Penalty & Outstanding-Balance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tiered late-payment penalties (50% / 100% / 200% of base) and an outstanding-balance flow that lets a customer pay the remainder via a fresh QR after a partial settlement, plus an auto-cancel sweep for parcels abandoned 24h after the penalty clock starts.

**Architecture:** Two new columns on `parcels` (`penalty_clock_started_at`, `amount_paid`). A DB trigger keeps `amount_paid` equal to `SUM(payments.amount WHERE status='succeeded')` so application code never has to maintain it. A pure derivation function `computeOutstanding` in a new `packages/shared/src/penalty.ts` produces all penalty state from `(price, penalty_clock_started_at, amount_paid, firstSuccessfulPaymentAt, now)`. `markPaymentSucceeded` learns to treat partial payments correctly. `POST /api/payment/charges` issues fresh QRs for outstanding-only amounts. A new sweep endpoint auto-cancels abandoned parcels.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Drizzle ORM, Supabase Postgres, raw SQL for the trigger (Drizzle has no first-class trigger support).

**Source spec:** `docs/superpowers/specs/2026-04-25-late-payment-penalty-design.md`

**Manual verification instead of automated tests:** The repo has no test runner and adding one is out of scope (consistent with the Beam integration plan that preceded this one). Each task ends with an explicit manual verification step (curl / SQL / type-check) with exact expected output.

---

## Prerequisite: clean working tree

Before starting Task 1, the working tree must be clean. As of plan-write time, there are uncommitted changes from the Beam shape fixes, dev `/me` self-heal, and Smartpost mock work. Either commit them or stash them — do not start this plan on top of an uncommitted mess.

```bash
git status                    # should show nothing uncommitted (or only tsconfig.tsbuildinfo)
```

If there are uncommitted changes other than `tsconfig.tsbuildinfo`, stop and ask the controller what to do with them.

---

## File Structure

**New files**
- `packages/shared/src/penalty.ts` — `PENALTY_TIERS`, `ABANDON_AFTER_MINUTES`, types, `computeOutstanding` (pure function). Single responsibility: derive penalty state from inputs. Zero DB access.
- `packages/shared/sql/20260425_parcels_penalty_columns.sql` — `ALTER TABLE parcels` adding `penalty_clock_started_at` + `amount_paid` + the partial sweep index.
- `packages/shared/sql/20260425_amount_paid_trigger.sql` — Postgres function `refresh_parcel_amount_paid()` and trigger `payments_refresh_parcel_amount`.
- `apps/user/app/api/payment/sweep-abandoned/route.ts` — POST endpoint, cron-secret-gated, returns canceled list, writes `notification_log`.

**Modified files**
- `packages/shared/src/db/schema.ts` — add `penaltyClockStartedAt`, `amountPaid` to the `parcels` table.
- `packages/shared/package.json` — add `"./penalty": "./src/penalty.ts"` subpath export.
- `packages/shared/src/beam.ts` — `markPaymentSucceeded` only flips `is_paid=true, status='paid'` when `outstanding === 0`; otherwise leaves the parcel pending.
- `apps/user/app/api/payment/charges/route.ts` — replace `parcel.isPaid` and "no price" guards with `computeOutstanding`; charge Beam for `outstanding`, not `parcel.price`; return 410 for abandoned.
- `apps/user/app/api/payment/charges/[id]/route.ts` — include the full `outstanding` object in the GET response.
- `apps/user/app/pay/[parcelId]/page.tsx` — header amount lines, tier schedule card, banners (clock-not-started / frozen / abandoned).
- `.env.example` — `CRON_SECRET=` block.

**Untouched (called out explicitly)**
- `payments` table schema (no new columns).
- The webhook signature/HMAC code in `beam.ts`.
- `createBeamPromptPayCharge` (still receives a decimal-string `amount`; the call site computes `outstanding` and passes it).
- The Smartpost add-item flow.
- The dev-simulate endpoint (works as-is once `markPaymentSucceeded` is fixed; no changes needed there).

---

## Task 1: Add `penalty_clock_started_at` and `amount_paid` to Drizzle schema

**Files:**
- Modify: `packages/shared/src/db/schema.ts` (the `parcels` table block, currently around lines 35–51)

- [ ] **Step 1: Add the two columns to the `parcels` pgTable**

In `packages/shared/src/db/schema.ts`, find the `parcels` table definition. It currently ends like this (around lines 49–50):

```ts
  source: text("source").notNull().default("self"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});
```

Insert two new columns **before** `createdAt`:

```ts
  source: text("source").notNull().default("self"),
  /** Set once by the future Smartpost shipped-webhook. NULL = penalty clock not started. */
  penaltyClockStartedAt: timestamp("penalty_clock_started_at", { withTimezone: true }),
  /** Maintained by DB trigger as SUM(payments.amount WHERE status='succeeded'). */
  amountPaid: numeric("amount_paid", { precision: 14, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});
```

The imports `timestamp` and `numeric` are already present at the top of the file.

- [ ] **Step 2: Type-check the shared package**

```bash
pnpm -C packages/shared exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/db/schema.ts
git commit -m "$(cat <<'EOF'
feat(shared): add penalty_clock_started_at + amount_paid to parcels schema

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Write the SQL migration for the new columns

**Files:**
- Create: `packages/shared/sql/20260425_parcels_penalty_columns.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Late-payment penalty + outstanding-balance support.
-- penalty_clock_started_at: set once by the future Smartpost shipped-webhook; NULL => no penalty.
-- amount_paid: maintained by trigger payments_refresh_parcel_amount (see 20260425_amount_paid_trigger.sql).

ALTER TABLE parcels
  ADD COLUMN IF NOT EXISTS penalty_clock_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS amount_paid numeric(14, 2) NOT NULL DEFAULT 0;

-- Partial index to make the abandonment sweep query fast even at scale.
CREATE INDEX IF NOT EXISTS parcels_penalty_sweep_idx
  ON parcels (penalty_clock_started_at)
  WHERE amount_paid = 0 AND status NOT IN ('paid', 'canceled');
```

- [ ] **Step 2: Commit**

(No DB push here — the implementer running this plan does NOT have DB access. The human running the plan applies the migration manually via Supabase Studio or `psql`. Skip plan-time DB verification; Task 14 covers the end-to-end run.)

```bash
git add packages/shared/sql/20260425_parcels_penalty_columns.sql
git commit -m "$(cat <<'EOF'
feat(shared): SQL migration for parcels penalty columns

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Write the SQL trigger that maintains `parcels.amount_paid`

**Files:**
- Create: `packages/shared/sql/20260425_amount_paid_trigger.sql`

- [ ] **Step 1: Create the trigger file**

```sql
-- Enforces the invariant: parcels.amount_paid = SUM(payments.amount WHERE status='succeeded' AND parcel_id=parcels.id).
-- This is enforced in the database — not application code — so any writer to `payments`
-- (admin tools, manual SQL, future code paths) cannot drift the column.

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

DROP TRIGGER IF EXISTS payments_refresh_parcel_amount ON payments;
CREATE TRIGGER payments_refresh_parcel_amount
AFTER INSERT OR UPDATE OF status, amount OR DELETE ON payments
FOR EACH ROW EXECUTE FUNCTION refresh_parcel_amount_paid();
```

- [ ] **Step 2: Commit**

```bash
git add packages/shared/sql/20260425_amount_paid_trigger.sql
git commit -m "$(cat <<'EOF'
feat(shared): SQL trigger maintaining parcels.amount_paid

Encodes the invariant amount_paid = SUM(succeeded payments) at the DB
level so any writer to payments cannot drift the column.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Create `packages/shared/src/penalty.ts` — constants + types

**Files:**
- Create: `packages/shared/src/penalty.ts`
- Modify: `packages/shared/package.json` (add subpath export)

- [ ] **Step 1: Create `packages/shared/src/penalty.ts`**

```ts
/**
 * Late-payment penalty schedule. The clock starts at parcels.penalty_clock_started_at
 * (set by the future Smartpost shipped-webhook). Lateness Δ = now - penalty_clock_started_at.
 * Penalty is +multiplier * basePrice (NOT compounded across tiers).
 */
export const PENALTY_TIERS = [
  { startMinutes: 0, multiplier: 0.0 },
  { startMinutes: 30, multiplier: 0.5 },
  { startMinutes: 240, multiplier: 1.0 },
  { startMinutes: 960, multiplier: 2.0 },
] as const;

export type PenaltyTier = (typeof PENALTY_TIERS)[number];

/** If amount_paid is still 0 this many minutes after clock start, parcel is auto-canceled. */
export const ABANDON_AFTER_MINUTES = 24 * 60;

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
  currentTier: PenaltyTier | null;
  /** The next tier above the current; null if at top tier or frozen. */
  nextTier: PenaltyTier | null;
  /** Wall-clock when the next jump happens; null if frozen / clock not started / at top. */
  nextTierAt: Date | null;
  /** Wall-clock when auto-cancel triggers; null if frozen / clock not started. */
  abandonAt: Date | null;
  /** True if a partial payment has frozen the bill. */
  frozen: boolean;
};
```

- [ ] **Step 2: Add the subpath export in `packages/shared/package.json`**

The current `exports` block ends:

```json
    "./notifications": "./src/notifications.ts",
    "./beam": "./src/beam.ts"
  },
```

Change to:

```json
    "./notifications": "./src/notifications.ts",
    "./beam": "./src/beam.ts",
    "./penalty": "./src/penalty.ts"
  },
```

- [ ] **Step 3: Type-check**

```bash
pnpm -C packages/shared exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/penalty.ts packages/shared/package.json
git commit -m "$(cat <<'EOF'
feat(shared): penalty.ts constants + types

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Implement `computeOutstanding` in `penalty.ts`

**Files:**
- Modify: `packages/shared/src/penalty.ts` (append)

- [ ] **Step 1: Append `computeOutstanding` to `penalty.ts`**

Append to the end of `packages/shared/src/penalty.ts`:

```ts
/**
 * Pure derivation of penalty + outstanding state. Same inputs always produce
 * the same output. No DB access. Callers should pass freshly-read values.
 */
export function computeOutstanding(args: {
  /** parcels.price as numeric string, e.g. "100.00". */
  price: string;
  /** parcels.penalty_clock_started_at; null => clock has not started. */
  penaltyClockStartedAt: Date | null;
  /** parcels.amount_paid as numeric string, e.g. "0.00" or "100.00". */
  amountPaid: string;
  /** MIN(payments.paid_at WHERE status='succeeded' AND parcel_id=parcels.id); null if no payment yet. */
  firstSuccessfulPaymentAt: Date | null;
  now: Date;
}): Outstanding {
  const basePrice = Number(args.price);
  const paid = Number(args.amountPaid);
  if (!Number.isFinite(basePrice) || basePrice < 0) {
    throw new Error(`computeOutstanding: invalid price ${args.price}`);
  }

  const tierForMinutes = (deltaMin: number): PenaltyTier => {
    let chosen = PENALTY_TIERS[0];
    for (const t of PENALTY_TIERS) {
      if (deltaMin >= t.startMinutes) chosen = t;
      else break;
    }
    return chosen;
  };

  const tierAfter = (tier: PenaltyTier): PenaltyTier | null => {
    const idx = PENALTY_TIERS.indexOf(tier);
    if (idx < 0) return null;
    return PENALTY_TIERS[idx + 1] ?? null;
  };

  // 1. Clock not started: no penalty applies.
  if (!args.penaltyClockStartedAt) {
    const totalOwed = basePrice;
    const outstanding = Math.max(0, totalOwed - paid);
    return {
      state: outstanding === 0 ? "settled" : "clock_not_started",
      totalOwed,
      outstanding,
      currentTier: null,
      nextTier: null,
      nextTierAt: null,
      abandonAt: null,
      frozen: false,
    };
  }

  const clockStart = args.penaltyClockStartedAt;
  const abandonAt = new Date(clockStart.getTime() + ABANDON_AFTER_MINUTES * 60_000);

  // 2. Frozen: any successful payment freezes the bill at the tier in effect at that moment.
  if (paid > 0 && args.firstSuccessfulPaymentAt) {
    const frozenDeltaMin = Math.max(
      0,
      (args.firstSuccessfulPaymentAt.getTime() - clockStart.getTime()) / 60_000,
    );
    const frozenTier = tierForMinutes(frozenDeltaMin);
    const totalOwed = basePrice * (1 + frozenTier.multiplier);
    const outstanding = Math.max(0, totalOwed - paid);
    return {
      state: outstanding === 0 ? "settled" : "frozen",
      totalOwed,
      outstanding,
      currentTier: frozenTier,
      nextTier: null,
      nextTierAt: null,
      abandonAt: null,
      frozen: true,
    };
  }

  // 3. Abandoned: 24h elapsed and no payment.
  const nowMs = args.now.getTime();
  const deltaMin = (nowMs - clockStart.getTime()) / 60_000;
  if (deltaMin >= ABANDON_AFTER_MINUTES && paid === 0) {
    // Use the top tier in effect at abandonment cutoff for display purposes.
    const finalTier = tierForMinutes(ABANDON_AFTER_MINUTES);
    const totalOwed = basePrice * (1 + finalTier.multiplier);
    return {
      state: "abandoned",
      totalOwed,
      outstanding: totalOwed, // not relevant once canceled, but consistent
      currentTier: finalTier,
      nextTier: null,
      nextTierAt: null,
      abandonAt,
      frozen: false,
    };
  }

  // 4. Active: pick current tier from elapsed minutes.
  const currentTier = tierForMinutes(deltaMin);
  const nextTier = tierAfter(currentTier);
  const totalOwed = basePrice * (1 + currentTier.multiplier);
  const outstanding = Math.max(0, totalOwed - paid);
  const nextTierAt = nextTier
    ? new Date(clockStart.getTime() + nextTier.startMinutes * 60_000)
    : null;
  return {
    state: outstanding === 0 ? "settled" : "active",
    totalOwed,
    outstanding,
    currentTier,
    nextTier,
    nextTierAt,
    abandonAt,
    frozen: false,
  };
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm -C packages/shared exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Manual verification by walkthrough**

Read the function and trace each example below in your head against the code. Confirm each one matches; if not, fix the function before proceeding.

| Inputs | Expected `state` | Expected `totalOwed` | Expected `outstanding` |
|---|---|---|---|
| `price="100.00"`, clockStart=null, paid="0.00" | `clock_not_started` | 100 | 100 |
| `price="100.00"`, clockStart=null, paid="100.00" | `settled` | 100 | 0 |
| `price="100.00"`, clockStart=10min ago, paid="0.00", now=now | `active` (Tier 0, grace) | 100 | 100 |
| `price="100.00"`, clockStart=45min ago, paid="0.00" | `active` (Tier 1, +50%) | 150 | 150 |
| `price="100.00"`, clockStart=5h ago, paid="0.00" | `active` (Tier 2, +100%) | 200 | 200 |
| `price="100.00"`, clockStart=20h ago, paid="0.00" | `active` (Tier 3, +200%) | 300 | 300 |
| `price="100.00"`, clockStart=24h ago, paid="0.00" | `abandoned` | 300 | 300 |
| `price="100.00"`, clockStart=1h ago, paid="100.00", firstPaymentAt=45min after clockStart | `frozen` (at Tier 1) | 150 | 50 |
| `price="100.00"`, clockStart=1h ago, paid="150.00", firstPaymentAt=45min after clockStart | `settled` | 150 | 0 |

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/penalty.ts
git commit -m "$(cat <<'EOF'
feat(shared): computeOutstanding pure derivation function

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Update `markPaymentSucceeded` to handle partial settlements

**Files:**
- Modify: `packages/shared/src/beam.ts` (`markPaymentSucceeded`, currently around lines 180–209)

- [ ] **Step 1: Replace `markPaymentSucceeded` with the partial-aware version**

Find the existing function in `packages/shared/src/beam.ts`:

```ts
export async function markPaymentSucceeded({
  providerChargeId,
  rawWebhookPayload,
}: {
  providerChargeId: string;
  rawWebhookPayload: unknown;
}): Promise<{ paymentId: string; parcelId: string } | null> {
  const db = getDb();
  return await db.transaction(async (tx) => {
    const updated = await tx
      .update(payments)
      .set({
        status: "succeeded",
        paidAt: new Date(),
        rawWebhookPayload: rawWebhookPayload as any,
        updatedAt: new Date(),
      })
      .where(
        and(eq(payments.providerChargeId, providerChargeId), eq(payments.status, "pending")),
      )
      .returning({ id: payments.id, parcelId: payments.parcelId });
    const row = updated[0];
    if (!row) return null;
    await tx
      .update(parcels)
      .set({ isPaid: true, status: "paid", updatedAt: new Date() })
      .where(eq(parcels.id, row.parcelId));
    return { paymentId: row.id, parcelId: row.parcelId };
  });
}
```

Replace **the entire function body** with this version. The trigger from Task 3 keeps `parcels.amount_paid` correct on its own; we re-read the parcel after writing `payments` to see the post-trigger state, then conditionally flip `is_paid`/`status`:

```ts
export async function markPaymentSucceeded({
  providerChargeId,
  rawWebhookPayload,
}: {
  providerChargeId: string;
  rawWebhookPayload: unknown;
}): Promise<{ paymentId: string; parcelId: string; settled: boolean } | null> {
  const db = getDb();
  return await db.transaction(async (tx) => {
    const updated = await tx
      .update(payments)
      .set({
        status: "succeeded",
        paidAt: new Date(),
        rawWebhookPayload: rawWebhookPayload as any,
        updatedAt: new Date(),
      })
      .where(
        and(eq(payments.providerChargeId, providerChargeId), eq(payments.status, "pending")),
      )
      .returning({ id: payments.id, parcelId: payments.parcelId, paidAt: payments.paidAt });
    const row = updated[0];
    if (!row) return null;

    // Trigger has updated parcels.amount_paid by now. Re-read and decide
    // whether this payment fully settles the parcel.
    const [parcel] = await tx
      .select({
        price: parcels.price,
        penaltyClockStartedAt: parcels.penaltyClockStartedAt,
        amountPaid: parcels.amountPaid,
      })
      .from(parcels)
      .where(eq(parcels.id, row.parcelId))
      .limit(1);

    if (!parcel) {
      throw new Error(`markPaymentSucceeded: parcel ${row.parcelId} disappeared mid-transaction`);
    }

    const out = computeOutstanding({
      price: parcel.price ?? "0",
      penaltyClockStartedAt: parcel.penaltyClockStartedAt,
      amountPaid: parcel.amountPaid,
      firstSuccessfulPaymentAt: row.paidAt,
      now: new Date(),
    });

    if (out.outstanding === 0) {
      await tx
        .update(parcels)
        .set({ isPaid: true, status: "paid", updatedAt: new Date() })
        .where(eq(parcels.id, row.parcelId));
    } else {
      // Partial settlement: keep parcel pending. The customer will pay the
      // remainder via a fresh QR.
      await tx
        .update(parcels)
        .set({ updatedAt: new Date() })
        .where(eq(parcels.id, row.parcelId));
    }

    return { paymentId: row.id, parcelId: row.parcelId, settled: out.outstanding === 0 };
  });
}
```

- [ ] **Step 2: Add the `computeOutstanding` import**

The function above references `computeOutstanding`, which lives in the same package. Add an import. The existing imports at the top of `beam.ts` are `import crypto from "node:crypto"` (line 1) and the mid-file `import { eq, and } from "drizzle-orm"; import { getDb, payments, parcels } from "./db";`. Add to the top of the file (just under `import crypto`):

```ts
import { computeOutstanding } from "./penalty";
```

- [ ] **Step 3: Type-check**

```bash
pnpm -C packages/shared exec tsc --noEmit
```
Expected: no errors. If you get errors about the existing two callers (`apps/user/app/api/payment/beam-webhook/route.ts` and `apps/user/app/api/payment/dev-simulate/[id]/route.ts`) consuming the return type — they only check truthiness of the return value, so adding `settled` to the return type does not break them. Verify quickly:

```bash
pnpm -C apps/user exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/beam.ts
git commit -m "$(cat <<'EOF'
feat(shared): markPaymentSucceeded only settles parcel when outstanding=0

Partial settlements now leave the parcel in pending_payment so the
customer can pay the remainder via a fresh QR. The DB trigger keeps
parcels.amount_paid correct; this function just re-reads and decides.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Update `POST /api/payment/charges` to use `outstanding`

**Files:**
- Modify: `apps/user/app/api/payment/charges/route.ts` (currently around 135 lines)

- [ ] **Step 1: Add a helper to read the first-payment timestamp**

At the top of `apps/user/app/api/payment/charges/route.ts`, add the import for `computeOutstanding` and a small helper function. The current imports are:

```ts
import { and, eq, gt } from "drizzle-orm";
import { getDb, parcels, payments } from "@quickload/shared/db";
import { createBeamPromptPayCharge, readBeamEnv } from "@quickload/shared/beam";
import { NextResponse } from "next/server";
import { requireLineSession } from "@/lib/require-user";
```

Add after them:

```ts
import { computeOutstanding } from "@quickload/shared/penalty";
import { asc } from "drizzle-orm";
```

(`asc` is needed below for the first-payment lookup.)

- [ ] **Step 2: Replace the parcel-fetched + guard block**

Find this block (currently around lines 22–31):

```ts
    const db = getDb();
    const [parcel] = await db.select().from(parcels).where(eq(parcels.id, parcelId)).limit(1);
    if (!parcel || parcel.userId !== session.userId) {
      // 404 to avoid leaking existence.
      return NextResponse.json({ ok: false, error: "Parcel not found" }, { status: 404 });
    }
    if (parcel.isPaid) {
      return NextResponse.json({ ok: false, error: "Parcel already paid" }, { status: 400 });
    }
    if (!parcel.price || Number(parcel.price) <= 0) {
      return NextResponse.json({ ok: false, error: "Parcel has no price" }, { status: 400 });
    }
```

Replace with:

```ts
    const db = getDb();
    const [parcel] = await db.select().from(parcels).where(eq(parcels.id, parcelId)).limit(1);
    if (!parcel || parcel.userId !== session.userId) {
      // 404 to avoid leaking existence.
      return NextResponse.json({ ok: false, error: "Parcel not found" }, { status: 404 });
    }
    if (!parcel.price || Number(parcel.price) <= 0) {
      return NextResponse.json({ ok: false, error: "Parcel has no price" }, { status: 400 });
    }

    const [firstPayment] = await db
      .select({ paidAt: payments.paidAt })
      .from(payments)
      .where(and(eq(payments.parcelId, parcelId), eq(payments.status, "succeeded")))
      .orderBy(asc(payments.paidAt))
      .limit(1);

    const out = computeOutstanding({
      price: parcel.price,
      penaltyClockStartedAt: parcel.penaltyClockStartedAt,
      amountPaid: parcel.amountPaid,
      firstSuccessfulPaymentAt: firstPayment?.paidAt ?? null,
      now: new Date(),
    });

    if (out.state === "settled") {
      return NextResponse.json({ ok: false, error: "Parcel already paid" }, { status: 400 });
    }
    if (out.state === "abandoned") {
      return NextResponse.json(
        { ok: false, error: "Parcel canceled due to abandonment" },
        { status: 410 },
      );
    }
```

- [ ] **Step 3: Replace the Beam-amount line**

Find the existing call to `createBeamPromptPayCharge` (currently around lines 73–80):

```ts
      beamResult = await createBeamPromptPayCharge({
        env,
        amount: parcel.price,
        currency: "THB",
        referenceId: parcel.id,
        idempotencyKey,
        returnUrl,
        expiryTime: ourExpiryDate.toISOString(),
      });
```

Change `amount: parcel.price` → `amount: out.outstanding.toFixed(2)`. The block becomes:

```ts
      beamResult = await createBeamPromptPayCharge({
        env,
        amount: out.outstanding.toFixed(2),
        currency: "THB",
        referenceId: parcel.id,
        idempotencyKey,
        returnUrl,
        expiryTime: ourExpiryDate.toISOString(),
      });
```

- [ ] **Step 4: Replace the inserted `payments.amount` value**

Find the insert (currently around lines 99–117). The `amount: parcel.price` must also change. Find:

```ts
        amount: parcel.price,
        currency: "THB",
        paymentMethod: "promptpay",
```

Change to:

```ts
        amount: out.outstanding.toFixed(2),
        currency: "THB",
        paymentMethod: "promptpay",
```

(The `payments.amount` for this row must equal the QR's amount, not the parcel's base price, so the trigger increments `amount_paid` correctly when this charge succeeds.)

- [ ] **Step 5: Type-check**

```bash
pnpm -C apps/user exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/user/app/api/payment/charges/route.ts
git commit -m "$(cat <<'EOF'
feat(payment): charges route issues QRs for outstanding amount

Replaces parcel.isPaid guard with computeOutstanding; the new QR's
amount and payments.amount both equal `outstanding` so the trigger
maintains amount_paid correctly. Returns 410 for abandoned parcels.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Update `GET /api/payment/charges/[id]` to include `outstanding`

**Files:**
- Modify: `apps/user/app/api/payment/charges/[id]/route.ts`

- [ ] **Step 1: Update imports**

Current imports:

```ts
import { eq } from "drizzle-orm";
import { getDb, parcels, payments } from "@quickload/shared/db";
import { NextResponse } from "next/server";
import { requireLineSession } from "@/lib/require-user";
```

Add `and, asc` to the drizzle import and add the penalty import:

```ts
import { and, asc, eq } from "drizzle-orm";
import { getDb, parcels, payments } from "@quickload/shared/db";
import { computeOutstanding } from "@quickload/shared/penalty";
import { NextResponse } from "next/server";
import { requireLineSession } from "@/lib/require-user";
```

- [ ] **Step 2: Compute outstanding and add it to the response**

Find the response block (currently the last `NextResponse.json` at the end of the GET handler, around lines 42–56):

```ts
    return NextResponse.json({
      ok: true,
      data: {
        paymentId: payment.id,
        status: effectiveStatus,
        amount: payment.amount,
        currency: payment.currency,
        qrPayload: payment.qrPayload,
        expiresAt: payment.expiresAt?.toISOString() ?? null,
        paidAt: payment.paidAt?.toISOString() ?? null,
        parcelId: parcel.id,
        trackingId: parcel.trackingId,
      },
    });
```

Insert the outstanding computation just before the return, and add `outstanding` to the response:

```ts
    const [firstPayment] = await db
      .select({ paidAt: payments.paidAt })
      .from(payments)
      .where(and(eq(payments.parcelId, parcel.id), eq(payments.status, "succeeded")))
      .orderBy(asc(payments.paidAt))
      .limit(1);

    const out = computeOutstanding({
      price: parcel.price ?? "0",
      penaltyClockStartedAt: parcel.penaltyClockStartedAt,
      amountPaid: parcel.amountPaid,
      firstSuccessfulPaymentAt: firstPayment?.paidAt ?? null,
      now: new Date(),
    });

    return NextResponse.json({
      ok: true,
      data: {
        paymentId: payment.id,
        status: effectiveStatus,
        amount: payment.amount,
        currency: payment.currency,
        qrPayload: payment.qrPayload,
        expiresAt: payment.expiresAt?.toISOString() ?? null,
        paidAt: payment.paidAt?.toISOString() ?? null,
        parcelId: parcel.id,
        trackingId: parcel.trackingId,
        outstanding: {
          state: out.state,
          totalOwed: out.totalOwed,
          outstanding: out.outstanding,
          currentTier: out.currentTier,
          nextTier: out.nextTier,
          nextTierAt: out.nextTierAt?.toISOString() ?? null,
          abandonAt: out.abandonAt?.toISOString() ?? null,
          frozen: out.frozen,
        },
      },
    });
```

- [ ] **Step 3: Type-check**

```bash
pnpm -C apps/user exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add 'apps/user/app/api/payment/charges/[id]/route.ts'
git commit -m "$(cat <<'EOF'
feat(payment): include outstanding in charge status response

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Add `CRON_SECRET` to `.env.example`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Append a `CRON_SECRET` block**

The current `.env.example` ends with the Beam + payment-mock + smartpost-mock blocks. Append:

```
# Shared secret for cron-callable endpoints (e.g. /api/payment/sweep-abandoned).
# Send as `X-Cron-Token: <value>` header. Generate a long random string in production.
CRON_SECRET=
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "$(cat <<'EOF'
chore(env): document CRON_SECRET for cron-callable endpoints

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Create `POST /api/payment/sweep-abandoned`

**Files:**
- Create: `apps/user/app/api/payment/sweep-abandoned/route.ts`

- [ ] **Step 1: Create the route file**

```ts
import { and, eq, isNotNull, lte, notInArray, sql } from "drizzle-orm";
import { getDb, notificationLog, parcels, payments } from "@quickload/shared/db";
import { ABANDON_AFTER_MINUTES } from "@quickload/shared/penalty";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("[sweep-abandoned] CRON_SECRET is not set");
    return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
  }
  const presented = request.headers.get("x-cron-token");
  if (presented !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const sweptAt = new Date();
  const cutoff = new Date(sweptAt.getTime() - ABANDON_AFTER_MINUTES * 60_000);

  // Atomic: cancel parcels whose clock started before cutoff AND have no payment yet.
  // The amount_paid filter is re-checked at row-write time so a payment landing
  // mid-sweep does not get its parcel canceled (sql.raw because amount_paid is numeric).
  const canceled = await db
    .update(parcels)
    .set({ status: "canceled", updatedAt: sweptAt })
    .where(
      and(
        isNotNull(parcels.penaltyClockStartedAt),
        lte(parcels.penaltyClockStartedAt, cutoff),
        eq(parcels.amountPaid, "0"),
        notInArray(parcels.status, ["paid", "canceled"]),
      ),
    )
    .returning({
      parcelId: parcels.id,
      trackingId: parcels.trackingId,
      priceBaseTHB: parcels.price,
      penaltyClockStartedAt: parcels.penaltyClockStartedAt,
    });

  // Expire any pending payments rows for the canceled parcels and log notifications.
  for (const row of canceled) {
    await db
      .update(payments)
      .set({ status: "expired", updatedAt: sweptAt })
      .where(and(eq(payments.parcelId, row.parcelId), eq(payments.status, "pending")));

    await db.insert(notificationLog).values({
      lineUserId: "system",
      type: "parcel_auto_canceled",
      payload: {
        parcelId: row.parcelId,
        trackingId: row.trackingId,
        priceBaseTHB: row.priceBaseTHB,
        penaltyClockStartedAt: row.penaltyClockStartedAt?.toISOString() ?? null,
        sweptAt: sweptAt.toISOString(),
      },
      status: "queued",
    });
  }

  console.info(`[sweep-abandoned] sweptAt=${sweptAt.toISOString()} canceled=${canceled.length}`);

  return NextResponse.json({
    ok: true,
    sweptAt: sweptAt.toISOString(),
    canceledCount: canceled.length,
    canceled: canceled.map((c) => ({
      parcelId: c.parcelId,
      trackingId: c.trackingId,
      priceBaseTHB: c.priceBaseTHB,
      penaltyClockStartedAt: c.penaltyClockStartedAt?.toISOString() ?? null,
    })),
  });
}
```

Note: `sql` import is only used if you switch to a raw filter; the `eq(parcels.amountPaid, "0")` with the numeric column works because Drizzle's numeric uses string equality. If type-check complains, remove the unused `sql` import.

- [ ] **Step 2: Type-check**

```bash
pnpm -C apps/user exec tsc --noEmit
```
Expected: no errors. If `sql` is unused, remove it from the import line.

- [ ] **Step 3: Commit**

```bash
git add apps/user/app/api/payment/sweep-abandoned/route.ts
git commit -m "$(cat <<'EOF'
feat(payment): POST /api/payment/sweep-abandoned

Cancels parcels whose penalty clock started >24h ago with no payment.
Auth via X-Cron-Token header against process.env.CRON_SECRET. Writes
to notification_log so the future notification system has the data.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Update `/pay/[parcelId]` types to include `outstanding`

**Files:**
- Modify: `apps/user/app/pay/[parcelId]/page.tsx`

- [ ] **Step 1: Add the `Outstanding` type to `ChargeData`**

Find the existing type definitions near the top of the file (around lines 8–20):

```tsx
type ChargeStatus = "pending" | "succeeded" | "failed" | "expired" | "canceled";

type ChargeData = {
  paymentId: string;
  status: ChargeStatus;
  amount: string;
  currency: string;
  qrPayload: string | null;
  expiresAt: string | null;
  paidAt: string | null;
  parcelId: string;
  trackingId: string | null;
};
```

Replace with:

```tsx
type ChargeStatus = "pending" | "succeeded" | "failed" | "expired" | "canceled";

type OutstandingState =
  | "clock_not_started"
  | "active"
  | "frozen"
  | "abandoned"
  | "settled";

type PenaltyTier = { startMinutes: number; multiplier: number };

type Outstanding = {
  state: OutstandingState;
  totalOwed: number;
  outstanding: number;
  currentTier: PenaltyTier | null;
  nextTier: PenaltyTier | null;
  /** ISO-8601. */
  nextTierAt: string | null;
  /** ISO-8601. */
  abandonAt: string | null;
  frozen: boolean;
};

type ChargeData = {
  paymentId: string;
  status: ChargeStatus;
  amount: string;
  currency: string;
  qrPayload: string | null;
  expiresAt: string | null;
  paidAt: string | null;
  parcelId: string;
  trackingId: string | null;
  outstanding: Outstanding;
};
```

- [ ] **Step 2: Type-check (will not pass yet — outstanding is now required and we have not added it everywhere)**

```bash
pnpm -C apps/user exec tsc --noEmit
```
Expected: errors about `outstanding` missing in the `Omit<ChargeData, ...>` cast in `createCharge`. We fix that next.

- [ ] **Step 3: Update the create-response cast**

Find this in `createCharge` (around line 60):

```tsx
      const json = (await res.json()) as
        | { ok: true; data: Omit<ChargeData, "parcelId" | "trackingId" | "paidAt"> }
        | { ok: false; error: string };
```

Add `"outstanding"` to the `Omit`:

```tsx
      const json = (await res.json()) as
        | { ok: true; data: Omit<ChargeData, "parcelId" | "trackingId" | "paidAt" | "outstanding"> }
        | { ok: false; error: string };
```

(The create endpoint does not return outstanding in the create-response shape; the follow-up GET does.)

- [ ] **Step 4: Type-check**

```bash
pnpm -C apps/user exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add 'apps/user/app/pay/[parcelId]/page.tsx'
git commit -m "$(cat <<'EOF'
feat(payment): /pay page types include Outstanding

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Render header amount + tier schedule on `/pay/[parcelId]`

**Files:**
- Modify: `apps/user/app/pay/[parcelId]/page.tsx`

- [ ] **Step 1: Replace the amount block with outstanding-aware rendering**

Find this block (around lines 222–240, inside the `charge?.status === "pending"` branch — the part that renders the amount and tracking ID):

```tsx
              <div className="flex flex-col items-center gap-3">
                <p className="text-sm font-medium text-slate-500">ยอดที่ต้องชำระ</p>
                <p className="text-4xl font-semibold leading-none text-[#2726F5]">฿ {formattedAmount}</p>
                {charge.trackingId ? (
                  <p className="text-xs text-slate-500">หมายเลขพัสดุ: {charge.trackingId}</p>
                ) : null}
```

Replace with:

```tsx
              <div className="flex flex-col items-center gap-3">
                {charge.outstanding.frozen ? (
                  <>
                    <p className="text-sm font-medium text-slate-500">ยอดคงเหลือ</p>
                    <p className="text-4xl font-semibold leading-none text-[#2726F5]">
                      ฿ {formatTHB(charge.outstanding.outstanding)}
                    </p>
                    <p className="text-xs text-slate-500">
                      ชำระแล้ว ฿ {formatTHB(charge.outstanding.totalOwed - charge.outstanding.outstanding)} ·
                      ยอดเต็ม ฿ {formatTHB(charge.outstanding.totalOwed)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-slate-500">ยอดที่ต้องชำระ</p>
                    <p className="text-4xl font-semibold leading-none text-[#2726F5]">
                      ฿ {formatTHB(charge.outstanding.outstanding)}
                    </p>
                  </>
                )}
                {charge.trackingId ? (
                  <p className="text-xs text-slate-500">หมายเลขพัสดุ: {charge.trackingId}</p>
                ) : null}
```

- [ ] **Step 2: Add the `formatTHB` helper near the top of the file**

Find the existing `formattedAmount` const (around line 175):

```tsx
  const formattedAmount =
    charge?.amount != null
      ? new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
          Number(charge.amount),
        )
      : "-";
```

Replace with:

```tsx
  const formatTHB = (n: number): string =>
    new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const formattedAmount = charge?.amount != null ? formatTHB(Number(charge.amount)) : "-";
```

- [ ] **Step 3: Add the tier schedule card**

Find the `{charge.qrPayload && !charge.qrPayload.startsWith("data:image/") ? (` block (around line 257). **Above** that block (still inside the `pending` branch), add a tier schedule card:

```tsx
                <TierScheduleCard charge={charge} now={now} />

```

Note: `now` is already in scope as a `useState`-tracked timestamp.

- [ ] **Step 4: Define the `TierScheduleCard` component at the bottom of the file**

Append at the very end of `apps/user/app/pay/[parcelId]/page.tsx` (outside `PayPage`):

```tsx
function TierScheduleCard({ charge, now }: { charge: ChargeData; now: number }) {
  const o = charge.outstanding;
  const basePrice = charge.outstanding.totalOwed && charge.outstanding.currentTier
    ? charge.outstanding.totalOwed / (1 + charge.outstanding.currentTier.multiplier)
    : Number(charge.amount);

  const fmt = (n: number) =>
    new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const TIERS = [
    { label: "ภายใน 30 นาที", multiplier: 0.0, startMin: 0 },
    { label: "30 นาที – 4 ชั่วโมง", multiplier: 0.5, startMin: 30 },
    { label: "4 – 16 ชั่วโมง", multiplier: 1.0, startMin: 240 },
    { label: "มากกว่า 16 ชั่วโมง", multiplier: 2.0, startMin: 960 },
  ];

  const isCurrent = (m: number) =>
    o.currentTier != null && o.currentTier.multiplier === m;

  let nextLine: string | null = null;
  if (o.state === "active" && o.nextTier && o.nextTierAt) {
    const remainingMs = new Date(o.nextTierAt).getTime() - now;
    if (remainingMs > 0) {
      const totalSec = Math.floor(remainingMs / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      const ss = String(s).padStart(2, "0");
      const nextTotal = basePrice * (1 + o.nextTier.multiplier);
      const jumpBy = nextTotal - o.totalOwed;
      nextLine = `เพิ่มอีก ฿${fmt(jumpBy)} ใน ${hh}:${mm}:${ss}`;
    }
  } else if (o.state === "clock_not_started") {
    nextLine = "ค่าปรับยังไม่เริ่มคิด — เริ่มคิดเมื่อพัสดุถูกจัดส่ง";
  } else if (o.state === "frozen") {
    nextLine = `ยอดถูกตรึงที่ ฿${fmt(o.totalOwed)} เนื่องจากชำระบางส่วนแล้ว`;
  }

  return (
    <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
      <table className="w-full">
        <tbody>
          {TIERS.map((t) => {
            const total = basePrice * (1 + t.multiplier);
            const active = isCurrent(t.multiplier);
            return (
              <tr key={t.startMin} className={active ? "font-semibold text-[#2726F5]" : "text-slate-600"}>
                <td className="py-0.5">{t.label}</td>
                <td className="py-0.5 text-right">฿ {fmt(total)}</td>
                <td className="py-0.5 pl-2 text-[10px]">{active ? "◀ ปัจจุบัน" : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {nextLine ? <p className="mt-2 text-center text-slate-500">{nextLine}</p> : null}
    </div>
  );
}
```

- [ ] **Step 5: Type-check**

```bash
pnpm -C apps/user exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add 'apps/user/app/pay/[parcelId]/page.tsx'
git commit -m "$(cat <<'EOF'
feat(payment): tier schedule + frozen-balance UI on /pay screen

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Add abandoned + clock-not-started + frozen banners

**Files:**
- Modify: `apps/user/app/pay/[parcelId]/page.tsx`

- [ ] **Step 1: Add the abandoned branch**

Find this in the conditional render (around line 289, the `charge?.status === "canceled"` branch):

```tsx
            ) : charge?.status === "canceled" ? (
              <div className="py-8 text-center">
                <p className="text-lg font-semibold text-slate-800">ยกเลิกการชำระเงินแล้ว</p>
              </div>
            ) : null}
```

Just **above** this `canceled` branch, insert an abandoned branch that takes precedence on the parcel-level cancel:

```tsx
            ) : charge?.outstanding.state === "abandoned" ? (
              <div className="py-8 text-center">
                <p className="text-lg font-semibold text-rose-700">พัสดุถูกยกเลิกเนื่องจากไม่มีการชำระ</p>
                <p className="mt-1 text-sm text-slate-500">
                  ครบกำหนด 24 ชั่วโมงแล้วโดยไม่มีการชำระ ระบบจึงยกเลิกอัตโนมัติ
                </p>
              </div>
            ) : charge?.status === "canceled" ? (
```

Note: this puts `abandoned` before the existing `canceled` arm so the customer sees the abandonment-specific copy. Once the sweep flips the parcel to `canceled`, both conditions are true and the first match wins.

- [ ] **Step 2: Type-check**

```bash
pnpm -C apps/user exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add 'apps/user/app/pay/[parcelId]/page.tsx'
git commit -m "$(cat <<'EOF'
feat(payment): abandoned-state banner on /pay screen

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: End-to-end manual verification

No new files. This is the acceptance gate. The human running the plan does this with a real local DB.

- [ ] **Step 1: Apply both SQL migrations to your local Supabase**

```bash
psql "$DATABASE_URL" -f packages/shared/sql/20260425_parcels_penalty_columns.sql
psql "$DATABASE_URL" -f packages/shared/sql/20260425_amount_paid_trigger.sql
```

Verify:

```bash
psql "$DATABASE_URL" -c "\d parcels"     # expect penalty_clock_started_at, amount_paid columns
psql "$DATABASE_URL" -c "\d payments"    # trigger payments_refresh_parcel_amount listed
```

- [ ] **Step 2: Set `CRON_SECRET` in `apps/user/.env.local`**

```bash
echo "CRON_SECRET=test-cron-secret-$(date +%s)" >> apps/user/.env.local
```

Restart dev server: `pnpm dev:user`.

- [ ] **Step 3: Smoke-test the trigger**

Pick any parcel id with at least one succeeded payment (or create one via the existing flow). Confirm `amount_paid` matches the sum:

```bash
psql "$DATABASE_URL" -c "
SELECT p.id, p.amount_paid,
       (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE parcel_id=p.id AND status='succeeded') AS actual_sum
  FROM parcels p
  WHERE p.amount_paid > 0
  LIMIT 5;
"
```

Expected: `amount_paid = actual_sum` for every row.

- [ ] **Step 4: Force a partial-settlement scenario (without waiting hours)**

In SQL (use a real parcel id that's currently `pending_payment` with a created QR):

```bash
# Pretend Smartpost shipped the parcel 45 minutes ago (so we're in Tier 1, +50%).
psql "$DATABASE_URL" -c "
UPDATE parcels SET penalty_clock_started_at = now() - interval '45 minutes'
WHERE id = '<your-parcel-uuid>';
"
```

Reload `/pay/<your-parcel-uuid>`:
- Expected header: `ยอดที่ต้องชำระ ฿150.00` (was 100 base × 1.5).
- Expected tier card: row "30 นาที – 4 ชั่วโมง · ฿150.00" highlighted.
- Expected next-line: `เพิ่มอีก ฿50.00 ใน HH:MM:SS` (countdown to hour-4 mark).

Click the dev-simulate paid button. Expected:
- Customer paid ฿150 (the new outstanding) → parcel flips to `paid`. (Because dev-simulate hits `markPaymentSucceeded` which checks the `outstanding === 0` path with the new ฿150 charge.)
- Confirm DB: `parcels.status='paid'`, `is_paid=true`, `amount_paid=150.00`.

- [ ] **Step 5: Force the partial-stale-QR scenario (the real bug we set out to fix)**

Set up:

```bash
psql "$DATABASE_URL" -c "
UPDATE parcels SET penalty_clock_started_at = now() - interval '45 minutes',
                   status='pending_payment', is_paid=false
WHERE id = '<your-parcel-uuid>';
DELETE FROM payments WHERE parcel_id = '<your-parcel-uuid>';
"
```

Now the parcel is in Tier 1 (owes ฿150) but has no payment yet. Manually insert a "succeeded" payment of only ฿100 to simulate the customer paying with a saved old QR:

```bash
psql "$DATABASE_URL" -c "
INSERT INTO payments (parcel_id, user_id, provider, provider_charge_id, amount, currency, payment_method, status, paid_at)
VALUES ('<parcel-uuid>', '<user-uuid>', 'beam', 'ch_stale_test_$(date +%s)', '100.00', 'THB', 'promptpay', 'succeeded', now());
"
```

Verify:
```bash
psql "$DATABASE_URL" -c "
SELECT id, status, is_paid, amount_paid FROM parcels WHERE id='<parcel-uuid>';
"
```
Expected: `status='pending_payment'`, `is_paid=false`, `amount_paid=100.00`. (Trigger updated `amount_paid`. `markPaymentSucceeded` was not invoked because we wrote the row directly — but the trigger fires regardless, which is the whole point.)

Reload `/pay/<parcel-uuid>`:
- Expected header: `ยอดคงเหลือ ฿50.00` and a `ชำระแล้ว ฿100.00 · ยอดเต็ม ฿150.00` line.
- Expected tier schedule still shows Tier 1 highlighted; no countdown (frozen).
- Expected QR is for ฿50.00 (the remainder), not ฿150 or ฿100.

Click dev-simulate. Expected:
- Parcel flips to `paid`, `amount_paid=150.00`.

- [ ] **Step 6: Verify abandonment + sweep**

```bash
# Pretend a parcel's clock started 25 hours ago and has zero payment.
psql "$DATABASE_URL" -c "
UPDATE parcels SET penalty_clock_started_at = now() - interval '25 hours',
                   status='pending_payment', is_paid=false, amount_paid='0'
WHERE id = '<your-parcel-uuid>';
DELETE FROM payments WHERE parcel_id = '<your-parcel-uuid>';
"
```

Reload `/pay/<parcel-uuid>` — expect the abandoned banner.

Trigger the sweep:

```bash
curl -i -X POST http://localhost:3020/api/payment/sweep-abandoned \
  -H "X-Cron-Token: $(grep CRON_SECRET apps/user/.env.local | cut -d= -f2)"
```

Expected: 200 with `{ ok: true, canceledCount: 1, canceled: [{ parcelId: '<your-parcel-uuid>', ... }] }`.

Verify:
```bash
psql "$DATABASE_URL" -c "
SELECT status FROM parcels WHERE id='<parcel-uuid>';
SELECT type, payload FROM notification_log WHERE type='parcel_auto_canceled' ORDER BY sent_at DESC LIMIT 1;
"
```
Expected: `parcels.status='canceled'`, one `notification_log` row of type `parcel_auto_canceled` whose payload includes the parcel id.

Without the secret header, sweep returns 401:

```bash
curl -i -X POST http://localhost:3020/api/payment/sweep-abandoned
```
Expected: 401.

- [ ] **Step 7: Verify abandonment race-handling**

```bash
# Race scenario: clock 25h ago, but a payment lands. Sweep should NOT cancel.
psql "$DATABASE_URL" -c "
UPDATE parcels SET penalty_clock_started_at = now() - interval '25 hours',
                   status='pending_payment', is_paid=false
WHERE id = '<another-parcel-uuid>';
INSERT INTO payments (parcel_id, user_id, provider, provider_charge_id, amount, currency, payment_method, status, paid_at)
VALUES ('<another-parcel-uuid>', '<user-uuid>', 'beam', 'ch_race_$(date +%s)', '50.00', 'THB', 'promptpay', 'succeeded', now());
"

curl -X POST http://localhost:3020/api/payment/sweep-abandoned \
  -H "X-Cron-Token: $(grep CRON_SECRET apps/user/.env.local | cut -d= -f2)"
```

Expected: this parcel is **not** in the canceled list because `amount_paid > 0` after the trigger fired.

- [ ] **Step 8: This task only verifies; no commit.**

If anything failed, go back and fix the failing task. Do not commit a "fix from Task 14" — fix the root cause in the original task.

---

## Self-review

Walking through the spec with the plan in hand:

**Spec coverage**
- [x] §3 tier schedule — Task 4 (constants), Task 5 (logic).
- [x] §3.1 clock-not-started — Task 5 first branch; Task 12/13 banner.
- [x] §3.2 freeze-on-partial — Task 5 second branch; Task 12 frozen UI.
- [x] §3.3 no fallback — implicit (we never auto-set the column anywhere).
- [x] §4.1 schema columns — Task 1 (Drizzle), Task 2 (SQL).
- [x] §4.3 trigger — Task 3.
- [x] §4.4 partial sweep index — Task 2 (in same migration as the columns).
- [x] §5 derivation function — Task 5.
- [x] §6.1 markPaymentSucceeded change — Task 6.
- [x] §6.2 charges route uses outstanding — Task 7.
- [x] §6.3 status route returns outstanding — Task 8.
- [x] §6.4 sweep endpoint — Task 9 (env), Task 10 (route).
- [x] §6.5 Smartpost contract — out of scope per spec (documented only).
- [x] §7 UI — Task 11 (types), Task 12 (header + tier card), Task 13 (banners).
- [x] §8.1 concurrent partial+full — handled by the transaction in `markPaymentSucceeded` (Task 6) + atomic trigger (Task 3).
- [x] §8.2 stale-QR scenario — Task 14 Step 5 explicitly verifies it.
- [x] §8.3 webhook after auto-cancel — `markPaymentSucceeded` will still credit the payment via the trigger; parcel stays canceled. The current `markPaymentSucceeded` does not check parcel status, so the payment row writes and the trigger updates `amount_paid` even on a canceled parcel — matches spec ("customer's money is recorded and refundable"). No code change needed beyond Task 6.
- [x] §8.4 sweep race — Task 10 includes `eq(parcels.amountPaid, "0")` in the WHERE; Task 14 Step 7 verifies.
- [x] §8.5 timezone — `timestamptz` everywhere (existing convention); `Date` math is UTC under the hood.
- [x] §8.6 schedule retroactive — accepted in spec.
- [x] §8.7 ฿0 parcel — Task 5 handles `basePrice = 0` cleanly (totalOwed=0, outstanding=0, state=settled).

**Placeholder scan** — searched for "TBD", "TODO", "implement later", "similar to Task N", "fill in", "add appropriate". None present. Every code step has full code.

**Type consistency** — `Outstanding` shape from Task 4/5 (`packages/shared/src/penalty.ts`) flows through:
- `markPaymentSucceeded` consumes it via `computeOutstanding(...)` — Task 6.
- `POST /api/payment/charges` consumes it via `computeOutstanding(...)` — Task 7.
- `GET /api/payment/charges/[id]` returns it (with Date→ISO string conversion for `nextTierAt`/`abandonAt`) — Task 8.
- `/pay/[parcelId]` types mirror the GET response (with ISO strings for the dates) — Task 11.
- `TierScheduleCard` reads `o.currentTier.multiplier`, `o.totalOwed`, `o.nextTier`, `o.nextTierAt`, `o.state`, `o.frozen` — all consistent with the type in Task 11.

`markPaymentSucceeded` return type changed from `{ paymentId, parcelId } | null` to `{ paymentId, parcelId, settled } | null`. Both existing callers (beam-webhook and dev-simulate routes) only check truthiness of the return, not field shape, so the change is non-breaking.

**Scope** — single coherent feature. Two new SQL files, one new TS module, one new route, four file modifications, one env var. No multi-system coordination. Reasonable to execute as one plan.
