# Beam Checkout Payment Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a PromptPay-QR payment step after `/send/review` → draft creation, using Beam Checkout's Charges API (sandbox), with webhook-driven state updates and a dev-only "simulate paid" shortcut.

**Architecture:** A new `/pay/[parcelId]` route renders a Beam-issued PromptPay QR and polls `/api/payment/charges/[id]` every 2.5s. Beam's signed webhook is the source of truth for the paid transition; both it and the dev-simulate endpoint call one internal function (`markPaymentSucceeded`) — zero divergence. Payments are first-class rows in a new `payments` table; parcels gain a `pending_payment` status value.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Drizzle ORM, Supabase Postgres, iron-session, `qrcode` npm package (already a dep), Beam Checkout Charges API.

**Source spec:** `docs/superpowers/specs/2026-04-25-beam-payment-integration-design.md`

**Manual verification instead of automated tests:** The repo has no test runner and adding one is explicitly out of scope per the spec. Each task ends with an explicit manual verification step (curl / UI / DB query) with exact expected output.

---

## File Structure

**New files**
- `packages/shared/src/beam.ts` — Beam HTTP client + HMAC helpers + `markPaymentSucceeded`.
- `packages/shared/sql/20260425_payments.sql` — migration for the new table (mirrors the Drizzle schema; the repo keeps raw SQL alongside schema.ts for reference).
- `apps/user/app/pay/[parcelId]/page.tsx` — payment screen (client component).
- `apps/user/app/api/payment/charges/route.ts` — `POST` create/resume charge.
- `apps/user/app/api/payment/charges/[id]/route.ts` — `GET` status.
- `apps/user/app/api/payment/charges/[id]/cancel/route.ts` — `POST` cancel.
- `apps/user/app/api/payment/beam-webhook/route.ts` — `POST` webhook receiver.
- `apps/user/app/api/payment/dev-simulate/[id]/route.ts` — `POST` dev shortcut.

**Modified files**
- `packages/shared/src/db/schema.ts` — add `payments` table + export.
- `packages/shared/package.json` — export `@quickload/shared/beam`.
- `apps/user/app/api/parcels/draft/route.ts` — accept client-supplied `estimatedPrice`; set `status='pending_payment'`; prefer Smartpost `finalcost` when present, else `estimatedPrice`.
- `apps/user/app/send/review/page.tsx` — pass `baseEstimatedPrice` to draft, redirect to `/pay/{id}` instead of `/send/success`.
- `.env.example` — Beam env vars.
- `apps/user/.env.local` — Beam env vars (local; not committed).

**Untouched (called out explicitly)**
- `POST /api/smartpost/add-item` and its call site — no changes.
- Admin app — no changes.
- `/payment` page (legacy balance view) — no changes.

---

## Task 1: Add `payments` table to Drizzle schema

**Files:**
- Modify: `packages/shared/src/db/schema.ts` (append at end of file)

- [ ] **Step 1: Add the `payments` table export**

Append to `packages/shared/src/db/schema.ts` after the `recipientAddresses` block:

```ts
/** Payment attempts for parcels; provider is currently always 'beam' (Beam Checkout). */
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
  // 'pending' | 'succeeded' | 'failed' | 'expired' | 'canceled'
  status: text("status").notNull().default("pending"),
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

- [ ] **Step 2: Type-check the shared package**

Run from repo root:
```bash
pnpm -C packages/shared exec tsc --noEmit
```
Expected: no errors. If errors mention missing imports, check the top of `schema.ts` — `pgTable, uuid, text, numeric, timestamp, jsonb` are all already imported (verified in context).

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/db/schema.ts
git commit -m "feat(shared): add payments table to Drizzle schema

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Write and apply the `payments` SQL migration

**Files:**
- Create: `packages/shared/sql/20260425_payments.sql`

- [ ] **Step 1: Create the SQL migration file**

Create `packages/shared/sql/20260425_payments.sql`:

```sql
-- Payment attempts for parcels (Beam Checkout integration).
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id uuid NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id),
  provider text NOT NULL DEFAULT 'beam',
  provider_charge_id text UNIQUE,
  amount numeric(14, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'THB',
  payment_method text NOT NULL DEFAULT 'promptpay',
  status text NOT NULL DEFAULT 'pending',
  qr_payload text,
  expires_at timestamptz,
  paid_at timestamptz,
  raw_create_response jsonb,
  raw_webhook_payload jsonb,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS payments_parcel_id_status_idx ON payments (parcel_id, status);
CREATE INDEX IF NOT EXISTS payments_status_expires_at_idx ON payments (status, expires_at);
```

- [ ] **Step 2: Apply via `drizzle-kit push`**

From repo root:
```bash
pnpm db:push
```
Expected: Drizzle detects the new `payments` table and applies it. If it prompts about conflicts, accept the create. If it prefers `drizzle-kit generate` + migrate, run that instead — `pnpm db:push` is the canonical dev workflow per `README.md`.

- [ ] **Step 3: Verify the table exists in Supabase**

Run (requires `psql` or Supabase Studio):
```bash
psql "$DATABASE_URL" -c "\d payments"
```
Expected output shows all columns listed above, the FK to `parcels`, and two indexes `payments_parcel_id_status_idx` and `payments_status_expires_at_idx`.

Alternative (no psql): open Supabase Studio → SQL editor → `SELECT * FROM payments LIMIT 1;` → expect empty result, no error.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/sql/20260425_payments.sql
git commit -m "feat(shared): payments table SQL migration

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Add Beam env vars to `.env.example`

**Files:**
- Modify: `.env.example` (append a new section)

- [ ] **Step 1: Append Beam env block**

Append to `.env.example`:

```
# Beam Checkout (apps/user) — use playground URL for sandbox, api URL for prod.
BEAM_API_BASE_URL=https://playground.api.beamcheckout.com
BEAM_MERCHANT_ID=
BEAM_API_KEY=
BEAM_WEBHOOK_HMAC_KEY=

# Dev-only: renders the "[DEV] simulate paid" button on /pay/[parcelId].
# Must be unset in staging/production.
NEXT_PUBLIC_PAYMENT_MOCK=
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore(env): document Beam Checkout env vars

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 3: Copy into your local `apps/user/.env.local`** *(not committed)*

Manually (the engineer running the plan does this one):

```bash
cat >> apps/user/.env.local <<'EOF'

BEAM_API_BASE_URL=https://playground.api.beamcheckout.com
BEAM_MERCHANT_ID=<fill in from Beam Lighthouse playground>
BEAM_API_KEY=<fill in from Beam Lighthouse playground>
BEAM_WEBHOOK_HMAC_KEY=<fill in from Beam Lighthouse playground>
NEXT_PUBLIC_PAYMENT_MOCK=1
EOF
```

Values come from https://lighthouse.beamcheckout.com playground environment. Leaving `BEAM_*` empty is fine for Tasks 4–11 (UI and dev-simulate work without Beam credentials); you only need them filled for Task 12+ (real sandbox test).

---

## Task 4: Create `packages/shared/src/beam.ts` — skeleton + HMAC verification

**Files:**
- Create: `packages/shared/src/beam.ts`
- Modify: `packages/shared/package.json` (add export)

- [ ] **Step 1: Create `packages/shared/src/beam.ts`**

```ts
import crypto from "node:crypto";

/** Beam webhook HMAC verification per docs.beamcheckout.com/webhook/webhook. */
export function verifyBeamWebhookSignature({
  rawBody,
  signatureHeader,
  hmacKeyBase64,
}: {
  rawBody: string;
  signatureHeader: string | null | undefined;
  hmacKeyBase64: string;
}): boolean {
  if (!signatureHeader) return false;
  if (!hmacKeyBase64) return false;
  let key: Buffer;
  try {
    key = Buffer.from(hmacKeyBase64, "base64");
  } catch {
    return false;
  }
  const expected = crypto.createHmac("sha256", key).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export type BeamEnv = {
  baseUrl: string;
  merchantId: string;
  apiKey: string;
  hmacKeyBase64: string;
};

export function readBeamEnv(): BeamEnv {
  const baseUrl = process.env.BEAM_API_BASE_URL ?? "";
  const merchantId = process.env.BEAM_MERCHANT_ID ?? "";
  const apiKey = process.env.BEAM_API_KEY ?? "";
  const hmacKeyBase64 = process.env.BEAM_WEBHOOK_HMAC_KEY ?? "";
  return { baseUrl, merchantId, apiKey, hmacKeyBase64 };
}
```

- [ ] **Step 2: Add the subpath export in `packages/shared/package.json`**

Find the `"exports"` block and add `"./beam": "./src/beam.ts"` so it looks like:

```json
"exports": {
  ".": "./src/index.ts",
  "./db/schema": "./src/db/schema.ts",
  "./db": "./src/db/index.ts",
  "./client": "./src/client.ts",
  "./types": "./src/types/index.ts",
  "./legacy": "./src/legacy/adapter.ts",
  "./line": "./src/line.ts",
  "./notifications": "./src/notifications.ts",
  "./beam": "./src/beam.ts"
},
```

- [ ] **Step 3: Smoke-test the HMAC helper**

Create a throwaway test file `/tmp/beam-hmac-smoke.mjs`:

```js
import crypto from "node:crypto";
import { verifyBeamWebhookSignature } from "../Users/propaganda/Documents/works/Other/quickload/packages/shared/src/beam.ts";
// NOTE: Node cannot import .ts directly. Use tsx instead.
```

Scratch that — easier: use `tsx` which is transitively available. Run from repo root:

```bash
npx tsx -e "
import { verifyBeamWebhookSignature } from './packages/shared/src/beam.ts';
import crypto from 'node:crypto';
const key = Buffer.from('secret-key', 'utf8').toString('base64');
const body = '{\"event\":\"charge.succeeded\"}';
const sig = crypto.createHmac('sha256', Buffer.from(key, 'base64')).update(body, 'utf8').digest('base64');
console.log('valid:', verifyBeamWebhookSignature({ rawBody: body, signatureHeader: sig, hmacKeyBase64: key }));
console.log('tampered:', verifyBeamWebhookSignature({ rawBody: body + 'x', signatureHeader: sig, hmacKeyBase64: key }));
console.log('missing header:', verifyBeamWebhookSignature({ rawBody: body, signatureHeader: null, hmacKeyBase64: key }));
"
```

Expected output:
```
valid: true
tampered: false
missing header: false
```

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/beam.ts packages/shared/package.json
git commit -m "feat(shared): beam.ts with HMAC verification + env reader

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Extend `beam.ts` — `createBeamPromptPayCharge`

**Files:**
- Modify: `packages/shared/src/beam.ts` (append)

- [ ] **Step 1: Append charge-creation helper**

Append to `packages/shared/src/beam.ts`:

```ts
export type BeamChargeResult = {
  chargeId: string;
  qrPayload: string;
  /** ISO-8601 timestamp; null if Beam did not return one. */
  expiresAt: string | null;
  rawResponse: unknown;
};

/**
 * Creates a PromptPay charge via Beam Charges API.
 * Request shape is based on docs.beamcheckout.com/charges/charges-api; if Beam's live
 * playground response shape differs from the field names below, adjust the extraction
 * block in this function (and log `rawResponse` for debugging).
 */
export async function createBeamPromptPayCharge({
  env,
  amount,
  currency,
  referenceId,
  idempotencyKey,
}: {
  env: BeamEnv;
  /** Decimal string, e.g. "85.00". */
  amount: string;
  currency: "THB";
  referenceId: string;
  idempotencyKey: string;
}): Promise<BeamChargeResult> {
  if (!env.baseUrl || !env.merchantId || !env.apiKey) {
    throw new Error("Beam env not configured (BEAM_API_BASE_URL / BEAM_MERCHANT_ID / BEAM_API_KEY)");
  }
  const basic = Buffer.from(`${env.merchantId}:${env.apiKey}`).toString("base64");
  const url = `${env.baseUrl.replace(/\/$/, "")}/api/v1/charges`;
  const body = {
    amount,
    currency,
    referenceId,
    paymentMethod: { type: "QR_PROMPT_PAY" },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // leave as null; we'll surface via error text.
  }
  if (!res.ok) {
    throw new Error(`Beam charges API returned ${res.status}: ${text.slice(0, 500)}`);
  }
  const obj = (json ?? {}) as Record<string, unknown>;
  const chargeId =
    typeof obj.id === "string"
      ? obj.id
      : typeof obj.chargeId === "string"
        ? obj.chargeId
        : null;
  const qrPayload = extractQrPayload(obj);
  const expiresAt =
    typeof obj.expiresAt === "string"
      ? obj.expiresAt
      : typeof obj.expiry === "string"
        ? obj.expiry
        : null;
  if (!chargeId || !qrPayload) {
    throw new Error(
      `Beam response missing chargeId or qrPayload. Raw: ${text.slice(0, 500)}`,
    );
  }
  return { chargeId, qrPayload, expiresAt, rawResponse: json };
}

function extractQrPayload(obj: Record<string, unknown>): string | null {
  // Shape uncertainty: Beam's response for QR_PROMPT_PAY may nest the payload under
  // paymentMethod.qrCode, qrCodeData, qrPayload, or return a base64 image. We accept
  // common shapes and fall through otherwise.
  const pm = (obj.paymentMethod ?? {}) as Record<string, unknown>;
  for (const candidate of [pm.qrPayload, pm.qrCode, pm.qrCodeData, pm.qrString, obj.qrPayload, obj.qrCode]) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return null;
}
```

- [ ] **Step 2: Type-check shared package**

```bash
pnpm -C packages/shared exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/beam.ts
git commit -m "feat(shared): createBeamPromptPayCharge helper

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Extend `beam.ts` — `markPaymentSucceeded` (the single source-of-truth function)

**Files:**
- Modify: `packages/shared/src/beam.ts` (append)

- [ ] **Step 1: Append `markPaymentSucceeded`**

Append to `packages/shared/src/beam.ts`:

```ts
import { eq, and } from "drizzle-orm";
import { getDb, payments, parcels } from "./db";

/**
 * Idempotent state transition called by BOTH the webhook handler and the dev-simulate
 * endpoint. One DB transaction flips `payments.status` to 'succeeded' (only if currently
 * 'pending') and sets the parent parcel to `is_paid=true, status='paid'`.
 *
 * Returns the paymentId that was updated, or null if nothing changed (e.g. already
 * succeeded, unknown chargeId). Callers should still return HTTP 200 on null.
 */
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

- [ ] **Step 2: Type-check**

```bash
pnpm -C packages/shared exec tsc --noEmit
```
Expected: no errors. If you get "Cannot find module './db'", confirm `src/db/index.ts` exports `payments` (it will, because `export * from "./schema"` — verified) and `parcels` (already exported).

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/beam.ts
git commit -m "feat(shared): markPaymentSucceeded transactional helper

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Modify `POST /api/parcels/draft` to accept `estimatedPrice` and set `pending_payment`

**Files:**
- Modify: `apps/user/app/api/parcels/draft/route.ts`

- [ ] **Step 1: Add `estimatedPrice` to the request body type and parse it**

In `apps/user/app/api/parcels/draft/route.ts`, update the `CreateBody` type to include:

```ts
/** Client-supplied base estimated price in baht; used if Smartpost finalcost is missing. */
estimatedPrice?: string;
```

- [ ] **Step 2: Replace the price-derivation block**

Find this block near line 87:
```ts
let parcelPrice: string | null = null;
if (smartpostFields.finalcost?.trim()) {
  const p = Number(smartpostFields.finalcost);
  if (Number.isFinite(p)) parcelPrice = p.toFixed(2);
}
```

Replace with:

```ts
let parcelPrice: string | null = null;
if (smartpostFields.finalcost?.trim()) {
  const p = Number(smartpostFields.finalcost);
  if (Number.isFinite(p) && p > 0) parcelPrice = p.toFixed(2);
}
if (!parcelPrice && body.estimatedPrice) {
  const p = Number(body.estimatedPrice);
  if (Number.isFinite(p) && p > 0) parcelPrice = p.toFixed(2);
}
```

- [ ] **Step 3: Change the inserted `status` from `"registered"` to `"pending_payment"`**

Find this in the `.values({ ... })` call (around line 122):
```ts
status: "registered",
```

Replace with:
```ts
status: "pending_payment",
```

- [ ] **Step 4: Type-check the user app**

```bash
pnpm -C apps/user exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Verify manually**

Start dev server:
```bash
pnpm dev:user
```

In another terminal, while logged in via LIFF (or with `NEXT_PUBLIC_DEV_SKIP_LINE_AUTH=1` if you use that), send a draft that previously worked. After, query DB:

```bash
psql "$DATABASE_URL" -c "SELECT id, status, price, is_paid FROM parcels ORDER BY created_at DESC LIMIT 1;"
```

Expected: most recent parcel has `status='pending_payment'`, `price` is set (from either Smartpost or `estimatedPrice`), `is_paid=false`.

(If you can't run Smartpost locally: skip Step 5; Task 14 will exercise the whole flow end-to-end with the UI change in place and you can pick the bug up there. Keep Ctrl+C'd dev server.)

- [ ] **Step 6: Commit**

```bash
git add apps/user/app/api/parcels/draft/route.ts
git commit -m "feat(parcels): set status=pending_payment and accept estimatedPrice on draft

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Create `POST /api/payment/charges` — create/resume charge

**Files:**
- Create: `apps/user/app/api/payment/charges/route.ts`

- [ ] **Step 1: Create the route file**

```ts
import { and, eq, gt } from "drizzle-orm";
import { getDb, parcels, payments } from "@quickload/shared/db";
import { createBeamPromptPayCharge, readBeamEnv } from "@quickload/shared/beam";
import { NextResponse } from "next/server";
import { requireLineSession } from "@/lib/require-user";

const QR_EXPIRY_MS = 10 * 60 * 1000;

type CreateChargeBody = { parcelId?: string };

export async function POST(request: Request) {
  try {
    const session = await requireLineSession();
    const body = (await request.json().catch(() => ({}))) as CreateChargeBody;
    const parcelId = body.parcelId?.trim();
    if (!parcelId) {
      return NextResponse.json({ ok: false, error: "parcelId required" }, { status: 400 });
    }

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

    // Step 3: resume existing non-expired pending.
    const now = new Date();
    const existing = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.parcelId, parcelId),
          eq(payments.status, "pending"),
          gt(payments.expiresAt, now),
        ),
      )
      .limit(1);
    if (existing[0]) {
      const p = existing[0];
      return NextResponse.json({
        ok: true,
        data: {
          paymentId: p.id,
          amount: p.amount,
          currency: p.currency,
          qrPayload: p.qrPayload,
          expiresAt: p.expiresAt?.toISOString() ?? null,
          status: p.status,
        },
      });
    }

    // Step 4: expire stale pending rows for this parcel.
    await db
      .update(payments)
      .set({ status: "expired", updatedAt: now })
      .where(and(eq(payments.parcelId, parcelId), eq(payments.status, "pending")));

    // Step 5-7: call Beam, insert row.
    const idempotencyKey = crypto.randomUUID();
    const env = readBeamEnv();
    let beamResult;
    try {
      beamResult = await createBeamPromptPayCharge({
        env,
        amount: parcel.price,
        currency: "THB",
        referenceId: parcel.id,
        idempotencyKey,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[payment.charges.create] Beam error:", msg);
      return NextResponse.json(
        { ok: false, error: "Payment provider unavailable" },
        { status: 502 },
      );
    }

    const ourExpiry = new Date(now.getTime() + QR_EXPIRY_MS);
    const beamExpiry = beamResult.expiresAt ? new Date(beamResult.expiresAt) : null;
    const expiresAt =
      beamExpiry && !isNaN(beamExpiry.getTime()) && beamExpiry < ourExpiry ? beamExpiry : ourExpiry;

    const [inserted] = await db
      .insert(payments)
      .values({
        parcelId: parcel.id,
        userId: parcel.userId,
        provider: "beam",
        providerChargeId: beamResult.chargeId,
        amount: parcel.price,
        currency: "THB",
        paymentMethod: "promptpay",
        status: "pending",
        qrPayload: beamResult.qrPayload,
        expiresAt,
        rawCreateResponse: beamResult.rawResponse as any,
        idempotencyKey,
      })
      .returning();

    if (!inserted) {
      return NextResponse.json({ ok: false, error: "Failed to persist payment" }, { status: 500 });
    }

    console.info(
      `[payment.charges.create] paymentId=${inserted.id} parcelId=${parcel.id} amount=${parcel.price}`,
    );

    return NextResponse.json({
      ok: true,
      data: {
        paymentId: inserted.id,
        amount: inserted.amount,
        currency: inserted.currency,
        qrPayload: inserted.qrPayload,
        expiresAt: inserted.expiresAt?.toISOString() ?? null,
        status: inserted.status,
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm -C apps/user exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/user/app/api/payment/charges/route.ts
git commit -m "feat(payment): POST /api/payment/charges (create/resume)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Create `GET /api/payment/charges/[id]` — status poll

**Files:**
- Create: `apps/user/app/api/payment/charges/[id]/route.ts`

- [ ] **Step 1: Create the route file**

```ts
import { eq } from "drizzle-orm";
import { getDb, parcels, payments } from "@quickload/shared/db";
import { NextResponse } from "next/server";
import { requireLineSession } from "@/lib/require-user";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const session = await requireLineSession();
    const paymentId = params.id;
    const db = getDb();
    const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
    if (!payment) {
      return NextResponse.json({ ok: false, error: "Payment not found" }, { status: 404 });
    }
    const [parcel] = await db
      .select()
      .from(parcels)
      .where(eq(parcels.id, payment.parcelId))
      .limit(1);
    if (!parcel || parcel.userId !== session.userId) {
      return NextResponse.json({ ok: false, error: "Payment not found" }, { status: 404 });
    }

    // Flip to expired lazily.
    let effectiveStatus = payment.status;
    if (
      payment.status === "pending" &&
      payment.expiresAt &&
      payment.expiresAt.getTime() < Date.now()
    ) {
      await db
        .update(payments)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(payments.id, payment.id));
      effectiveStatus = "expired";
    }

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
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm -C apps/user exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/user/app/api/payment/charges/[id]/route.ts
git commit -m "feat(payment): GET /api/payment/charges/[id] status poll

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Create `POST /api/payment/charges/[id]/cancel`

**Files:**
- Create: `apps/user/app/api/payment/charges/[id]/cancel/route.ts`

- [ ] **Step 1: Create the route file**

```ts
import { and, eq } from "drizzle-orm";
import { getDb, parcels, payments } from "@quickload/shared/db";
import { NextResponse } from "next/server";
import { requireLineSession } from "@/lib/require-user";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const session = await requireLineSession();
    const paymentId = params.id;
    const db = getDb();
    const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
    if (!payment) {
      return NextResponse.json({ ok: false, error: "Payment not found" }, { status: 404 });
    }
    const [parcel] = await db
      .select()
      .from(parcels)
      .where(eq(parcels.id, payment.parcelId))
      .limit(1);
    if (!parcel || parcel.userId !== session.userId) {
      return NextResponse.json({ ok: false, error: "Payment not found" }, { status: 404 });
    }

    await db
      .update(payments)
      .set({ status: "canceled", updatedAt: new Date() })
      .where(and(eq(payments.id, paymentId), eq(payments.status, "pending")));

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check + commit**

```bash
pnpm -C apps/user exec tsc --noEmit
git add apps/user/app/api/payment/charges/[id]/cancel/route.ts
git commit -m "feat(payment): POST /api/payment/charges/[id]/cancel

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Create `POST /api/payment/dev-simulate/[id]`

**Files:**
- Create: `apps/user/app/api/payment/dev-simulate/[id]/route.ts`

- [ ] **Step 1: Create the route file**

```ts
import { eq } from "drizzle-orm";
import { getDb, parcels, payments } from "@quickload/shared/db";
import { markPaymentSucceeded } from "@quickload/shared/beam";
import { NextResponse } from "next/server";
import { requireLineSession } from "@/lib/require-user";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  // Hard 404 in prod builds — invisible, not just disabled.
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const session = await requireLineSession();
    const paymentId = params.id;
    const db = getDb();
    const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
    if (!payment || payment.status !== "pending" || !payment.providerChargeId) {
      return NextResponse.json({ ok: false, error: "Payment not pending" }, { status: 404 });
    }
    const [parcel] = await db
      .select()
      .from(parcels)
      .where(eq(parcels.id, payment.parcelId))
      .limit(1);
    if (!parcel || parcel.userId !== session.userId) {
      return NextResponse.json({ ok: false, error: "Payment not found" }, { status: 404 });
    }

    await markPaymentSucceeded({
      providerChargeId: payment.providerChargeId,
      rawWebhookPayload: { simulated: true, at: new Date().toISOString() },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check + commit**

```bash
pnpm -C apps/user exec tsc --noEmit
git add apps/user/app/api/payment/dev-simulate/[id]/route.ts
git commit -m "feat(payment): POST /api/payment/dev-simulate/[id]

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Create `POST /api/payment/beam-webhook`

**Files:**
- Create: `apps/user/app/api/payment/beam-webhook/route.ts`

- [ ] **Step 1: Create the route file**

```ts
import { markPaymentSucceeded, readBeamEnv, verifyBeamWebhookSignature } from "@quickload/shared/beam";
import { NextResponse } from "next/server";

// Next.js App Router: disable caching and body parsing for raw signature verification.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-beam-signature");
  const event = request.headers.get("x-beam-event");

  const { hmacKeyBase64 } = readBeamEnv();
  const valid = verifyBeamWebhookSignature({
    rawBody,
    signatureHeader: signature,
    hmacKeyBase64,
  });

  console.info(
    `[payment.beam-webhook] event=${event ?? "?"} signatureValid=${valid} bytes=${rawBody.length}`,
  );

  if (!valid) {
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  if (event !== "charge.succeeded") {
    // Ignore other events cleanly so Beam stops retrying.
    return NextResponse.json({ ok: true, ignored: event });
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    // Already HMAC-verified, so malformed JSON here means a Beam bug. 200 + log.
    console.error("[payment.beam-webhook] signed but non-JSON body");
    return NextResponse.json({ ok: true });
  }

  const obj = (parsed ?? {}) as Record<string, unknown>;
  const chargeId =
    typeof obj.id === "string"
      ? obj.id
      : typeof obj.chargeId === "string"
        ? obj.chargeId
        : typeof (obj.data as Record<string, unknown> | undefined)?.id === "string"
          ? (obj.data as Record<string, unknown>).id as string
          : null;
  if (!chargeId) {
    console.error("[payment.beam-webhook] charge.succeeded missing id");
    return NextResponse.json({ ok: true });
  }

  const result = await markPaymentSucceeded({
    providerChargeId: chargeId,
    rawWebhookPayload: parsed,
  });

  if (result) {
    console.info(
      `[payment.beam-webhook] paid paymentId=${result.paymentId} parcelId=${result.parcelId}`,
    );
  } else {
    console.info(`[payment.beam-webhook] chargeId=${chargeId} already settled or unknown`);
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm -C apps/user exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Smoke-test the webhook** *(optional; runs without starting Beam)*

Start the dev server: `pnpm dev:user`. In another terminal, compute a valid HMAC signature against a test body and POST it.

```bash
# Use the same value you set for BEAM_WEBHOOK_HMAC_KEY (base64).
export HMAC_KEY_B64="$(grep BEAM_WEBHOOK_HMAC_KEY apps/user/.env.local | cut -d= -f2)"

# Craft a body
BODY='{"id":"ch_fake_123","status":"succeeded"}'
SIG=$(node -e "
  const crypto = require('node:crypto');
  const key = Buffer.from(process.env.HMAC_KEY_B64, 'base64');
  console.log(crypto.createHmac('sha256', key).update(process.argv[1], 'utf8').digest('base64'));
" "$BODY")

# Valid signature
curl -i -X POST http://localhost:3020/api/payment/beam-webhook \
  -H "Content-Type: application/json" \
  -H "X-Beam-Event: charge.succeeded" \
  -H "X-Beam-Signature: $SIG" \
  -d "$BODY"

# Tampered
curl -i -X POST http://localhost:3020/api/payment/beam-webhook \
  -H "Content-Type: application/json" \
  -H "X-Beam-Event: charge.succeeded" \
  -H "X-Beam-Signature: wrong" \
  -d "$BODY"
```

Expected: first call returns `200 {"ok":true}` and the dev-server logs include `signatureValid=true chargeId=ch_fake_123 already settled or unknown` (because no payment row has that chargeId yet — correct idempotent no-op). Second call returns `401`.

If `BEAM_WEBHOOK_HMAC_KEY` isn't set yet: skip this step; the route still type-checks and Task 15's end-to-end verification will cover it.

- [ ] **Step 4: Commit**

```bash
git add apps/user/app/api/payment/beam-webhook/route.ts
git commit -m "feat(payment): POST /api/payment/beam-webhook (HMAC-verified)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Create `/pay/[parcelId]` screen

**Files:**
- Create: `apps/user/app/pay/[parcelId]/page.tsx`

- [ ] **Step 1: Create the page file**

```tsx
"use client";

import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { use, useCallback, useEffect, useRef, useState } from "react";

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

const POLL_INTERVAL_MS = 2500;

export default function PayPage({ params }: { params: { parcelId: string } }) {
  const { parcelId } = params;
  const router = useRouter();

  const [charge, setCharge] = useState<ChargeData | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canceledRef = useRef(false);

  const renderQr = useCallback(async (payload: string) => {
    try {
      const url = await QRCode.toDataURL(payload, { width: 320, margin: 1 });
      setQrDataUrl(url);
    } catch {
      setQrDataUrl(null);
    }
  }, []);

  const createCharge = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/payment/charges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parcelId }),
      });
      const json = (await res.json()) as
        | { ok: true; data: Omit<ChargeData, "parcelId" | "trackingId" | "paidAt"> }
        | { ok: false; error: string };
      if (!res.ok || !("ok" in json) || !json.ok) {
        setError(("error" in json && json.error) || "ไม่สามารถสร้าง QR ได้");
        return;
      }
      // After create, fetch full status for parcelId + trackingId.
      const statusRes = await fetch(`/api/payment/charges/${json.data.paymentId}`);
      const statusJson = (await statusRes.json()) as { ok: true; data: ChargeData } | { ok: false; error: string };
      if (!statusRes.ok || !("ok" in statusJson) || !statusJson.ok) {
        setError(("error" in statusJson && statusJson.error) || "ไม่สามารถโหลดสถานะได้");
        return;
      }
      setCharge(statusJson.data);
      if (statusJson.data.qrPayload) {
        await renderQr(statusJson.data.qrPayload);
      }
    } catch {
      setError("เครือข่ายผิดพลาด กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  }, [parcelId, renderQr]);

  useEffect(() => {
    createCharge();
  }, [createCharge]);

  // Poll.
  useEffect(() => {
    if (!charge || charge.status !== "pending") return;
    if (canceledRef.current) return;
    const tick = async () => {
      if (document.hidden) {
        pollTimer.current = setTimeout(tick, POLL_INTERVAL_MS);
        return;
      }
      try {
        const res = await fetch(`/api/payment/charges/${charge.paymentId}`);
        if (res.ok) {
          const json = (await res.json()) as { ok: true; data: ChargeData };
          if (json.ok) {
            setCharge(json.data);
            if (json.data.status === "succeeded") return;
          }
        }
      } catch {
        // Swallow transient errors; keep polling.
      }
      pollTimer.current = setTimeout(tick, POLL_INTERVAL_MS);
    };
    pollTimer.current = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [charge]);

  // On success → redirect after brief flash.
  useEffect(() => {
    if (charge?.status !== "succeeded") return;
    const t = setTimeout(() => {
      const qp = new URLSearchParams({
        parcelId: charge.parcelId,
        trackingId: charge.trackingId ?? "",
      });
      router.replace(`/send/success?${qp.toString()}`);
    }, 400);
    return () => clearTimeout(t);
  }, [charge, router]);

  // Countdown tick.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleCancel = async () => {
    if (!charge || canceling) return;
    setCanceling(true);
    canceledRef.current = true;
    try {
      await fetch(`/api/payment/charges/${charge.paymentId}/cancel`, { method: "POST" });
    } catch {
      // ignore
    } finally {
      router.replace("/send/review");
    }
  };

  const handleSimulate = async () => {
    if (!charge || simulating) return;
    setSimulating(true);
    try {
      await fetch(`/api/payment/dev-simulate/${charge.paymentId}`, { method: "POST" });
    } catch {
      // ignore — poll will catch state change anyway
    } finally {
      setSimulating(false);
    }
  };

  const remainingSeconds = (() => {
    if (!charge?.expiresAt) return null;
    const ms = new Date(charge.expiresAt).getTime() - now;
    return Math.max(0, Math.floor(ms / 1000));
  })();
  const mm = remainingSeconds != null ? String(Math.floor(remainingSeconds / 60)).padStart(2, "0") : "--";
  const ss = remainingSeconds != null ? String(remainingSeconds % 60).padStart(2, "0") : "--";

  const formattedAmount =
    charge?.amount != null
      ? new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
          Number(charge.amount),
        )
      : "-";

  const showMockButton = process.env.NEXT_PUBLIC_PAYMENT_MOCK === "1";

  return (
    <main className="min-h-screen bg-slate-100 pb-36">
      <section className="bg-[#2726F5] px-6 pb-14 pt-10 text-white">
        <div className="mx-auto w-full max-w-lg">
          <button
            type="button"
            onClick={handleCancel}
            className="mb-3 inline-flex items-center gap-1 rounded-full border border-white/40 px-3 py-1.5 text-xs font-medium text-white/95"
            aria-label="กลับไปหน้าสรุปคำสั่งซื้อ"
          >
            <span aria-hidden>←</span>
            <span>กลับ</span>
          </button>
          <h1 className="text-3xl font-bold leading-none">ชำระเงิน</h1>
          <p className="mt-1 text-sm text-white/80">สแกน QR ด้วยแอปธนาคารของคุณ</p>
        </div>
      </section>

      <section className="-mt-8 px-6">
        <div className="mx-auto w-full max-w-lg space-y-4">
          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <p>{error}</p>
              <button
                type="button"
                onClick={createCharge}
                className="mt-2 inline-flex items-center rounded-full border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700"
              >
                สร้าง QR ใหม่
              </button>
            </div>
          ) : null}

          <div className="rounded-lg bg-white p-5 shadow-sm">
            {loading && !charge ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <div className="h-9 w-36 animate-pulse rounded-lg bg-slate-100" />
                <div className="h-64 w-64 animate-pulse rounded-lg bg-slate-100" />
              </div>
            ) : charge?.status === "pending" ? (
              <div className="flex flex-col items-center gap-3">
                <p className="text-sm font-medium text-slate-500">ยอดที่ต้องชำระ</p>
                <p className="text-4xl font-semibold leading-none text-[#2726F5]">฿ {formattedAmount}</p>
                {charge.trackingId ? (
                  <p className="text-xs text-slate-500">หมายเลขพัสดุ: {charge.trackingId}</p>
                ) : null}
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`QR PromptPay สำหรับยอด ${formattedAmount} บาท`}
                    className="h-64 w-64 rounded-lg border border-slate-200"
                  />
                ) : (
                  <div className="h-64 w-64 animate-pulse rounded-lg bg-slate-100" />
                )}
                <p className="text-xs font-medium text-slate-500">PromptPay</p>
                <p className="text-sm text-slate-600">
                  เหลือเวลา <span className="font-semibold text-slate-900">{mm}:{ss}</span>
                </p>
                {charge.qrPayload ? (
                  <p className="break-all text-center text-[10px] text-slate-400 select-all">
                    {charge.qrPayload}
                  </p>
                ) : null}

                {showMockButton ? (
                  <button
                    type="button"
                    onClick={handleSimulate}
                    disabled={simulating}
                    className="mt-2 inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800 disabled:opacity-50"
                  >
                    [DEV] {simulating ? "กำลังจำลอง..." : "จำลองการชำระสำเร็จ"}
                  </button>
                ) : null}
              </div>
            ) : charge?.status === "succeeded" ? (
              <div className="py-8 text-center">
                <p className="text-xl font-semibold text-emerald-600">ชำระเงินสำเร็จ</p>
                <p className="mt-1 text-sm text-slate-500">กำลังพาไปยังหน้าสรุป...</p>
              </div>
            ) : charge?.status === "expired" ? (
              <div className="py-8 text-center">
                <p className="text-lg font-semibold text-slate-800">QR หมดอายุแล้ว</p>
                <button
                  type="button"
                  onClick={createCharge}
                  className="mt-3 inline-flex items-center rounded-full bg-[#2726F5] px-4 py-2 text-sm font-medium text-white"
                >
                  สร้าง QR ใหม่
                </button>
              </div>
            ) : charge?.status === "failed" ? (
              <div className="py-8 text-center">
                <p className="text-lg font-semibold text-rose-700">การชำระเงินล้มเหลว</p>
                <button
                  type="button"
                  onClick={createCharge}
                  className="mt-3 inline-flex items-center rounded-full bg-[#2726F5] px-4 py-2 text-sm font-medium text-white"
                >
                  สร้าง QR ใหม่
                </button>
              </div>
            ) : charge?.status === "canceled" ? (
              <div className="py-8 text-center">
                <p className="text-lg font-semibold text-slate-800">ยกเลิกการชำระเงินแล้ว</p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 bg-slate-100 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 shadow-[0_-6px_20px_rgba(15,23,42,0.08)]">
        <div className="mx-auto w-full max-w-lg">
          <button
            type="button"
            onClick={handleCancel}
            disabled={canceling || charge?.status === "succeeded"}
            className="w-full rounded-full border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-700 disabled:opacity-50"
          >
            ยกเลิก
          </button>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm -C apps/user exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/user/app/pay/[parcelId]/page.tsx
git commit -m "feat(payment): /pay/[parcelId] screen with QR + polling + dev-simulate

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Wire `/send/review` to the new payment screen

**Files:**
- Modify: `apps/user/app/send/review/page.tsx`

- [ ] **Step 1: Pass `baseEstimatedPrice` to the draft call and redirect to `/pay/[id]`**

In `apps/user/app/send/review/page.tsx`, locate the `onConfirmCreateOrder` function. Replace the `/api/parcels/draft` call body and the subsequent redirect.

Find this block (currently around line 259):
```tsx
      const res = await fetch("/api/parcels/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId,
          recipientId,
          shippingMode,
          autoPrint,
          weightGram,
          widthCm,
          lengthCm,
          heightCm,
          parcelType,
          note,
          smartpostAddItemResponse: addItemJson.data,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; data?: { id?: string; trackingId?: string }; error?: string };
      if (!res.ok || !json.ok || !json.data?.id || !json.data?.trackingId) {
        setError(json.error ?? "สร้างออเดอร์ไม่สำเร็จ");
        return;
      }
      const params = new URLSearchParams({
        parcelId: json.data.id,
        trackingId: json.data.trackingId,
      });
      router.replace(`/send/success?${params.toString()}`);
```

Replace with:

```tsx
      const res = await fetch("/api/parcels/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId,
          recipientId,
          shippingMode,
          autoPrint,
          weightGram,
          widthCm,
          lengthCm,
          heightCm,
          parcelType,
          note,
          estimatedPrice: baseEstimatedPrice > 0 ? baseEstimatedPrice.toFixed(2) : undefined,
          smartpostAddItemResponse: addItemJson.data,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; data?: { id?: string; trackingId?: string }; error?: string };
      if (!res.ok || !json.ok || !json.data?.id) {
        setError(json.error ?? "สร้างออเดอร์ไม่สำเร็จ");
        return;
      }
      router.replace(`/pay/${json.data.id}`);
```

- [ ] **Step 2: Type-check**

```bash
pnpm -C apps/user exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/user/app/send/review/page.tsx
git commit -m "feat(send): route to /pay/[id] after draft creation

Passes baseEstimatedPrice (ราคาพื้นฐาน) to draft endpoint and sends
user to the payment screen instead of success.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: End-to-end manual verification (dev-simulate path)

No new files. This is the acceptance gate for everything built so far, using the `[DEV] simulate paid` button so Smartpost + real Beam are not required.

- [ ] **Step 1: Start dev server**

```bash
pnpm dev:user
```

Confirm your `apps/user/.env.local` has:
```
NEXT_PUBLIC_PAYMENT_MOCK=1
```

Beam credentials may still be blank — the charge-create call will fail with `502` if so. For the dev-simulate path we need a `payments` row to exist, so we need the create to succeed, which means Beam must be callable. **If you have no Beam playground credentials yet, skip to Task 16 — you need them for any real end-to-end.**

If you DO have Beam creds filled in `.env.local`, continue.

- [ ] **Step 2: Create a draft parcel via the UI**

Load `/send` → fill in a parcel (sender, recipient, dimensions, weight) → "ถัดไป" → on `/send/review`, note the "ราคาพื้นฐาน" value (e.g. `85 บาท`).

Click "ยืนยันสร้างออเดอร์". Expected:
- Smartpost add-item is called (may fail locally — if it does, this flow blocks here; that's a pre-existing limitation. Proceed to Task 16 using a pre-seeded parcel if needed).
- On success: URL becomes `/pay/{uuid}`.

- [ ] **Step 3: Verify payment screen state**

On `/pay/{uuid}`:
- Amount shown matches "ราคาพื้นฐาน" from review (e.g. `฿ 85.00`).
- A QR code image is rendered.
- A countdown starts near `10:00`.
- An amber `[DEV] จำลองการชำระสำเร็จ` button is visible (because `NEXT_PUBLIC_PAYMENT_MOCK=1`).

Verify DB state:
```bash
psql "$DATABASE_URL" -c "SELECT id, parcel_id, status, amount, expires_at FROM payments ORDER BY created_at DESC LIMIT 1;"
```
Expected: one row, `status='pending'`, `amount` matches.

- [ ] **Step 4: Click `[DEV] simulate paid`**

Expected:
- Within ~3s, the screen flashes "ชำระเงินสำเร็จ" and redirects to `/send/success?parcelId=...&trackingId=...`.

Verify DB state:
```bash
psql "$DATABASE_URL" -c "SELECT status, paid_at FROM payments ORDER BY created_at DESC LIMIT 1;"
psql "$DATABASE_URL" -c "SELECT status, is_paid FROM parcels ORDER BY created_at DESC LIMIT 1;"
```
Expected:
- `payments.status='succeeded'`, `paid_at` recent.
- `parcels.status='paid'`, `is_paid=true`.

- [ ] **Step 5: Idempotent refresh test**

Back up: create a new draft, land on `/pay/{uuid}` with a pending row. Hit refresh (⌘-R). Expected:
- Same QR renders.
- Countdown resumes from whatever's left of the original 10 min (not reset to 10:00).
- No new `payments` row is created. Verify:
```bash
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM payments WHERE parcel_id='<uuid>';"
```
Expected: `1`.

- [ ] **Step 6: Cancel test**

Create another draft, land on `/pay/{uuid}`, click "ยกเลิก". Expected:
- Returns to `/send/review`.
- DB: `payments.status='canceled'`, `parcels.status='pending_payment'`, `is_paid=false`.

- [ ] **Step 7: Expiry test**

Create a draft, land on `/pay/{uuid}`. In DB:
```bash
psql "$DATABASE_URL" -c "UPDATE payments SET expires_at=now() - interval '1 minute' WHERE id='<paymentId>';"
```
Wait for next poll (~2.5s). Expected: screen switches to "QR หมดอายุแล้ว" with "สร้าง QR ใหม่" button. Click it → new pending row in DB, old one → `expired`.

- [ ] **Step 8: Commit nothing; this task only verifies.**

If anything failed, go back and fix the failing task; do not proceed to Task 16 until this is green.

---

## Task 16: End-to-end verification against Beam sandbox via ngrok

No new files. This is optional but is the other acceptance gate — only run it once you have Beam playground credentials and are ready to test real webhook delivery.

- [ ] **Step 1: Start ngrok**

```bash
pnpm tunnel:user
```
Copy the HTTPS forwarding URL (e.g. `https://abc123.ngrok-free.app`).

- [ ] **Step 2: Register the webhook endpoint in Beam Lighthouse**

In https://lighthouse.beamcheckout.com → Playground environment → Webhooks:
- URL: `<ngrok-url>/api/payment/beam-webhook`
- Events: check `charge.succeeded` at minimum.
- Copy the HMAC key shown → paste into `apps/user/.env.local` as `BEAM_WEBHOOK_HMAC_KEY=...`.

Restart dev server so env loads: `pnpm dev:user`.

- [ ] **Step 3: Drive a full flow**

- Create a draft in the UI → land on `/pay/{uuid}` → the QR is a real Beam sandbox PromptPay QR.
- Pay using Beam's sandbox test PromptPay (their docs at `/playground/testing` list sandbox test payment instructions).
- Within ~3s of paying, screen flashes success and redirects to `/send/success`.

Verify logs and DB exactly as in Task 15 Step 4. Payment came from the **real webhook path**, not the dev button.

- [ ] **Step 4: Replay / tamper tests (optional but useful)**

Re-send the same webhook manually (e.g. from Beam's Lighthouse "resend" if present, or via curl with the original body + signature):
- Expected: `200 {"ok":true}`; no duplicate state changes.

Tamper with body or signature in curl:
- Expected: `401`.

---

## Self-review

Running through the spec now that the plan is drafted.

**Spec coverage**
- [x] New `payments` table — Task 1, 2.
- [x] `packages/shared/src/beam.ts` — Task 4, 5, 6.
- [x] `/pay/[parcelId]` — Task 13.
- [x] `POST /api/payment/charges` — Task 8.
- [x] `GET /api/payment/charges/[id]` — Task 9.
- [x] `POST /api/payment/charges/[id]/cancel` — Task 10.
- [x] `POST /api/payment/beam-webhook` — Task 12.
- [x] `POST /api/payment/dev-simulate/[id]` — Task 11.
- [x] Edit `/api/parcels/draft` to accept `estimatedPrice` + set `pending_payment` — Task 7.
- [x] Edit `/send/review` to redirect to `/pay/[id]` — Task 14.
- [x] Env vars — Task 3.
- [x] Manual test checklist — Task 15 + 16.
- [x] HMAC verification with timingSafeEqual — Task 4.
- [x] Transactional `markPaymentSucceeded` — Task 6.
- [x] Dev-simulate 404 in prod + session-gated — Task 11.
- [x] Idempotent resume — Task 8 step 3.
- [x] Lazy expiry flip — Task 9.

**Placeholder scan** — no TBDs / "implement later" / "similar to Task N". Code blocks present for every code step. Expected curl outputs specified.

**Type consistency** — `markPaymentSucceeded({ providerChargeId, rawWebhookPayload })` returns `{ paymentId, parcelId } | null`; consumed consistently by beam-webhook (Task 12) and dev-simulate (Task 11). `ChargeData` type in Task 13 matches the GET response shape in Task 9. `BeamChargeResult` from Task 5 is what `createBeamPromptPayCharge` returns and Task 8 consumes. `readBeamEnv()` / `BeamEnv` / `verifyBeamWebhookSignature` signatures consistent across Task 4, 5, 12.

**One pragmatic note baked into the plan:** Beam's exact response shape for a PromptPay charge isn't fully documented in the pages we fetched. Task 5's `extractQrPayload` accepts the common candidate fields; if Beam's live playground response names something we don't catch, the raw body is logged and extraction is a one-line fix in Task 5's helper. This is the only area where we're coding against guessed field names.
