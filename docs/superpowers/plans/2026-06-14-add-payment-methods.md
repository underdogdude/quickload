# Add KPLUS / MAKE / SCB_EASY / TRUE_MONEY Payment Methods — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four Beam-supported payment methods (K PLUS, MAKE by KBank, SCB Easy, TrueMoney Wallet) alongside the existing PromptPay flow on `/pay/[parcelId]`, with a method-switching UI below the QR.

**Architecture:** Generalize the existing `createBeamPromptPayCharge` into a single `createBeamCharge` that switches body shape on `paymentMethodType`. Persist `redirect_url` on the `payments` row to support `actionRequired=REDIRECT` flows. The `/pay/[parcelId]` page auto-creates PromptPay as today; below the QR, four tiles let the user cancel-then-recreate with another method. The LINE Flex push (QR card) is gated to PromptPay so the existing Flex code is untouched.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Drizzle ORM, Postgres (Supabase), Beam Checkout REST API, pnpm workspaces.

**Important notes for the executor:**
- The repo has **no automated test framework** (no vitest/jest, zero `*.test.ts` files). This plan uses **manual verification + type-check + lint** instead of unit tests. Do not introduce a test framework — that's scope creep.
- Migrations are SQL files in `packages/shared/sql/` applied via `node packages/shared/scripts/apply-sql.mjs <path>`, **not** `supabase/migrations/`.
- All Thai user-facing strings appear in code blocks below — copy them verbatim.
- Commit after every task. Keep diffs small and reviewable.

---

## File Structure

**New files:**
- `packages/shared/src/payment-methods.ts` — single registry of payment methods (id ↔ Beam type ↔ Thai label).
- `packages/shared/sql/20260614_payments_redirect_url.sql` — migration adding `payments.redirect_url`.

**Modified files:**
- `packages/shared/src/beam.ts` — rename `createBeamPromptPayCharge` → `createBeamCharge`, generalize body builder, add `extractRedirectUrl`, expand return type.
- `packages/shared/src/db/schema.ts` — add `redirectUrl` column to `payments` table.
- `packages/shared/package.json` — add `db:apply:redirect-url` script.
- `apps/user/app/api/payment/charges/route.ts` — accept optional `paymentMethod` in body, map via registry, persist redirectUrl, gate Flex push to PromptPay.
- `apps/user/app/api/payment/charges/[id]/route.ts` — return `paymentMethod`, `actionRequired`, `redirectUrl` in response.
- `apps/user/app/pay/[parcelId]/page.tsx` — render method-switch tiles below QR; handle REDIRECT flows with "Open app" button + mobile auto-redirect.

**Untouched (verify nothing leaks in):**
- `apps/user/app/payment/page.tsx` — outstanding/history list. Method labels in history will display the lowercase id (e.g. "kplus") via the existing `paymentMethodLabel` helper, which the spec accepts.
- `apps/user/lib/line-flex.ts`, `apps/user/lib/payment-line-notify.ts` — Flex code stays as-is.
- Webhook handler.

---

## Task 1: Create the payment-methods registry

**Files:**
- Create: `packages/shared/src/payment-methods.ts`

- [ ] **Step 1: Write the registry file**

Create `packages/shared/src/payment-methods.ts` with this exact content:

```ts
/**
 * Single source of truth for supported payment methods.
 *
 * `id` is the lowercase value stored in `payments.payment_method` (matches the
 * existing `"promptpay"` convention).
 *
 * `beamType` is the exact string Beam expects as `paymentMethodType` in the
 * Charges API. See docs.beamcheckout.com/charges/charges-api.
 *
 * `labelTh` is the Thai display label shown in tiles and history.
 */
export type PaymentMethodId =
  | "promptpay"
  | "kplus"
  | "make"
  | "scb_easy"
  | "truemoney";

export type BeamPaymentMethodType =
  | "QR_PROMPT_PAY"
  | "KPLUS"
  | "MAKE"
  | "SCB_EASY"
  | "TRUE_MONEY";

export type PaymentMethodDef = {
  id: PaymentMethodId;
  beamType: BeamPaymentMethodType;
  labelTh: string;
};

export const PAYMENT_METHODS: ReadonlyArray<PaymentMethodDef> = [
  { id: "promptpay", beamType: "QR_PROMPT_PAY", labelTh: "พร้อมเพย์" },
  { id: "kplus", beamType: "KPLUS", labelTh: "K PLUS" },
  { id: "make", beamType: "MAKE", labelTh: "MAKE by KBank" },
  { id: "scb_easy", beamType: "SCB_EASY", labelTh: "SCB Easy" },
  { id: "truemoney", beamType: "TRUE_MONEY", labelTh: "TrueMoney Wallet" },
];

export function getPaymentMethod(id: string): PaymentMethodDef | null {
  return PAYMENT_METHODS.find((m) => m.id === id) ?? null;
}
```

- [ ] **Step 2: Export the module from the shared package**

Add an export entry to `packages/shared/package.json` under `"exports"`. The current `"exports"` block has many keys; add this one **after** the `"./beam"` line so the diff is minimal:

```jsonc
    "./beam": "./src/beam.ts",
    "./payment-methods": "./src/payment-methods.ts",
    "./penalty": "./src/penalty.ts",
```

- [ ] **Step 3: Type-check the shared package**

Run: `pnpm --filter @quickload/shared exec tsc --noEmit`
Expected: Exit code 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/payment-methods.ts packages/shared/package.json
git commit -m "add payment-methods registry for beam charge types"
```

---

## Task 2: Add `redirect_url` column to payments table

**Files:**
- Create: `packages/shared/sql/20260614_payments_redirect_url.sql`
- Modify: `packages/shared/src/db/schema.ts`
- Modify: `packages/shared/package.json` (add apply script)

- [ ] **Step 1: Write the migration SQL**

Create `packages/shared/sql/20260614_payments_redirect_url.sql` with this content:

```sql
-- Adds payments.redirect_url to persist Beam REDIRECT-action URLs.
-- Methods like KPLUS / MAKE / SCB_EASY / TRUE_MONEY return a deeplink that
-- opens the bank/wallet app; we save it so reloading /pay/[parcelId] doesn't
-- re-create the charge.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS redirect_url text;
```

- [ ] **Step 2: Add `redirectUrl` to the Drizzle schema**

Open `packages/shared/src/db/schema.ts`. Find the `payments` pgTable definition (around line 188). Locate this line (around line 201):

```ts
  qrPayload: text("qr_payload"),
```

Add the new column directly below it:

```ts
  qrPayload: text("qr_payload"),
  redirectUrl: text("redirect_url"),
```

- [ ] **Step 3: Add a pnpm apply script**

Open `packages/shared/package.json`. In the `"scripts"` block, find the existing `db:apply:one-pending-idx` script and add the new script below it:

```jsonc
    "db:apply:one-pending-idx": "node ./scripts/apply-sql.mjs ./sql/20260426_payments_one_pending_per_parcel.sql",
    "db:apply:redirect-url": "node ./scripts/apply-sql.mjs ./sql/20260614_payments_redirect_url.sql"
```

(Note: add the comma after the `one-pending-idx` line if it isn't already trailing — JSON requires the comma when a new key follows.)

- [ ] **Step 4: Apply the migration to your local/dev database**

Run: `pnpm --filter @quickload/shared db:apply:redirect-url`
Expected: Script prints success (a single `ALTER TABLE` statement).

If you don't have a DATABASE_URL configured yet, this is fine — skip and note that the migration must run before the next deploy.

- [ ] **Step 5: Type-check the shared package**

Run: `pnpm --filter @quickload/shared exec tsc --noEmit`
Expected: Exit code 0.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/sql/20260614_payments_redirect_url.sql packages/shared/src/db/schema.ts packages/shared/package.json
git commit -m "add payments.redirect_url column for beam redirect flows"
```

---

## Task 3: Generalize `createBeamPromptPayCharge` → `createBeamCharge`

**Files:**
- Modify: `packages/shared/src/beam.ts`

- [ ] **Step 1: Rewrite `createBeamPromptPayCharge` as `createBeamCharge`**

Open `packages/shared/src/beam.ts`. Find the export `createBeamPromptPayCharge` (around line 57). Replace the entire function (lines 44–131) including its `BeamChargeResult` type with this:

```ts
import type { BeamPaymentMethodType } from "./payment-methods";

export type BeamActionRequired = "NONE" | "REDIRECT" | "ENCODED_IMAGE";

export type BeamChargeResult = {
  chargeId: string;
  /** Populated when actionRequired === "ENCODED_IMAGE". */
  qrPayload: string | null;
  /** Populated when actionRequired === "REDIRECT". */
  redirectUrl: string | null;
  actionRequired: BeamActionRequired;
  /** ISO-8601 timestamp; null if Beam did not return one. */
  expiresAt: string | null;
  rawResponse: unknown;
};

/**
 * Creates a Beam charge for the given paymentMethodType.
 * Per docs.beamcheckout.com/charges/charges-api: amount is integer in the smallest
 * unit (satang for THB).
 *
 * The body shape under `paymentMethod` differs per method. QR_PROMPT_PAY ships
 * `qrPromptPay: { expiryTime }`. The four mobile-app methods (KPLUS / MAKE /
 * SCB_EASY / TRUE_MONEY) ship an empty object under their respective key — this
 * is our current best-guess; verify the exact key against Beam playground during
 * manual integration (Task 7).
 */
export async function createBeamCharge({
  env,
  paymentMethodType,
  amount,
  currency,
  referenceId,
  idempotencyKey,
  returnUrl,
  expiryTime,
}: {
  env: BeamEnv;
  paymentMethodType: BeamPaymentMethodType;
  /** Decimal string in major units, e.g. "85.00". Converted to integer satang internally. */
  amount: string;
  currency: "THB";
  referenceId: string;
  idempotencyKey: string;
  returnUrl: string;
  /** ISO-8601 timestamp for QR expiry; only meaningful for QR_PROMPT_PAY. */
  expiryTime: string;
}): Promise<BeamChargeResult> {
  if (!env.baseUrl || !env.merchantId || !env.apiKey) {
    throw new Error("Beam env not configured (BEAM_API_BASE_URL / BEAM_MERCHANT_ID / BEAM_API_KEY)");
  }
  const major = Number(amount);
  if (!Number.isFinite(major) || major <= 0) {
    throw new Error(`Invalid amount: ${amount}`);
  }
  const amountSatang = Math.round(major * 100);
  const basic = Buffer.from(`${env.merchantId}:${env.apiKey}`).toString("base64");
  const url = `${env.baseUrl.replace(/\/$/, "")}/api/v1/charges`;

  const paymentMethod: Record<string, unknown> = { paymentMethodType };
  switch (paymentMethodType) {
    case "QR_PROMPT_PAY":
      paymentMethod.qrPromptPay = { expiryTime };
      break;
    case "KPLUS":
      paymentMethod.kplus = {};
      break;
    case "MAKE":
      paymentMethod.make = {};
      break;
    case "SCB_EASY":
      paymentMethod.scbEasy = {};
      break;
    case "TRUE_MONEY":
      paymentMethod.trueMoney = {};
      break;
  }

  const body = {
    amount: amountSatang,
    currency,
    referenceId,
    returnUrl,
    paymentMethod,
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
    throw new Error(
      `Beam charges API returned ${res.status} for ${paymentMethodType}: ${text.slice(0, 500)}`,
    );
  }
  const obj = (json ?? {}) as Record<string, unknown>;
  const chargeId =
    typeof obj.id === "string"
      ? obj.id
      : typeof obj.chargeId === "string"
        ? obj.chargeId
        : null;
  const actionRequired = extractActionRequired(obj);
  const qrPayload = extractQrPayload(obj);
  const redirectUrl = extractRedirectUrl(obj);
  const expiresAt = extractExpiresAt(obj);
  if (!chargeId) {
    throw new Error(
      `Beam response missing chargeId for ${paymentMethodType}. Raw: ${text.slice(0, 500)}`,
    );
  }
  // For QR_PROMPT_PAY the QR payload is required for the UI to render anything.
  if (paymentMethodType === "QR_PROMPT_PAY" && !qrPayload) {
    throw new Error(
      `Beam QR_PROMPT_PAY response missing qrPayload. Raw: ${text.slice(0, 500)}`,
    );
  }
  return { chargeId, qrPayload, redirectUrl, actionRequired, expiresAt, rawResponse: json };
}

function extractActionRequired(obj: Record<string, unknown>): BeamActionRequired {
  const raw = obj.actionRequired;
  if (typeof raw === "string") {
    const u = raw.toUpperCase();
    if (u === "REDIRECT" || u === "REDIRECT_TO_URL") return "REDIRECT";
    if (u === "ENCODED_IMAGE") return "ENCODED_IMAGE";
    if (u === "NONE") return "NONE";
    if (raw.length > 0) console.info(`[beam] unknown actionRequired: "${raw}"`);
  }
  // Fallback: infer from response shape.
  if (extractRedirectUrl(obj)) return "REDIRECT";
  if (extractQrPayload(obj)) return "ENCODED_IMAGE";
  return "NONE";
}

function extractRedirectUrl(obj: Record<string, unknown>): string | null {
  const direct = obj.redirectUrl;
  if (typeof direct === "string" && direct.length > 0) return direct;
  const nextAction = obj.nextAction as Record<string, unknown> | undefined;
  if (nextAction && typeof nextAction.redirectUrl === "string" && nextAction.redirectUrl.length > 0) {
    return nextAction.redirectUrl;
  }
  const pm = (obj.paymentMethod ?? {}) as Record<string, unknown>;
  for (const key of ["kplus", "make", "scbEasy", "trueMoney"]) {
    const sub = pm[key] as Record<string, unknown> | undefined;
    if (sub && typeof sub.redirectUrl === "string" && sub.redirectUrl.length > 0) {
      return sub.redirectUrl;
    }
  }
  return null;
}
```

- [ ] **Step 2: Update the existing call site to use the new function name**

Open `apps/user/app/api/payment/charges/route.ts`. Find this import (around line 3):

```ts
import { createBeamPromptPayCharge, readBeamEnv } from "@quickload/shared/beam";
```

Change to:

```ts
import { createBeamCharge, readBeamEnv } from "@quickload/shared/beam";
```

Then find the call site (around line 139):

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

Change to:

```ts
      beamResult = await createBeamCharge({
        env,
        paymentMethodType: "QR_PROMPT_PAY",
        amount: out.outstanding.toFixed(2),
        currency: "THB",
        referenceId: parcel.id,
        idempotencyKey,
        returnUrl,
        expiryTime: ourExpiryDate.toISOString(),
      });
```

(`paymentMethodType` is required — adding the literal preserves today's PromptPay behavior exactly.)

- [ ] **Step 3: Type-check the workspace**

Run: `pnpm --filter @quickload/shared exec tsc --noEmit && pnpm --filter @quickload/user exec tsc --noEmit`
Expected: Exit code 0 on both.

- [ ] **Step 4: Lint the user app**

Run: `pnpm --filter @quickload/user lint`
Expected: No errors related to changed files.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/beam.ts apps/user/app/api/payment/charges/route.ts
git commit -m "generalize beam charge creation across paymentMethodType"
```

---

## Task 4: Accept `paymentMethod` in POST /api/payment/charges

**Files:**
- Modify: `apps/user/app/api/payment/charges/route.ts`

- [ ] **Step 1: Import the registry**

Open `apps/user/app/api/payment/charges/route.ts`. Just below the existing `@quickload/shared/beam` import, add:

```ts
import { getPaymentMethod } from "@quickload/shared/payment-methods";
```

- [ ] **Step 2: Extend the body type**

Find this near the top of the file (around line 12):

```ts
type CreateChargeBody = { parcelId?: string };
```

Replace with:

```ts
type CreateChargeBody = {
  parcelId?: string;
  paymentMethod?: string;
};
```

- [ ] **Step 3: Validate `paymentMethod` and resolve the method def**

Find the section that reads the body (around line 66):

```ts
    const body = (await request.json().catch(() => ({}))) as CreateChargeBody;
    const parcelId = body.parcelId?.trim();
    if (!parcelId) {
      return NextResponse.json({ ok: false, error: "parcelId required" }, { status: 400 });
    }
```

Add the method resolution directly after the `parcelId` check (before the `db = getDb()` line):

```ts
    const methodId = (body.paymentMethod ?? "promptpay").trim();
    const methodDef = getPaymentMethod(methodId);
    if (!methodDef) {
      return NextResponse.json(
        { ok: false, error: "Unsupported payment method" },
        { status: 400 },
      );
    }
```

- [ ] **Step 4: Pass the Beam type to `createBeamCharge`**

Find the call to `createBeamCharge` (was changed in Task 3, around line 139). Change `paymentMethodType: "QR_PROMPT_PAY"` to:

```ts
        paymentMethodType: methodDef.beamType,
```

- [ ] **Step 5: Persist `paymentMethod` and `redirectUrl` on the row**

Find the `.insert(payments).values({ ... })` block (around line 166–181). Replace the entire `.values({...})` object with this:

```ts
        .values({
          parcelId: parcel.id,
          userId: parcel.userId,
          provider: "beam",
          providerChargeId: beamResult.chargeId,
          amount: out.outstanding.toFixed(2),
          currency: "THB",
          paymentMethod: methodDef.id,
          status: "pending",
          qrPayload: beamResult.qrPayload,
          redirectUrl: beamResult.redirectUrl,
          expiresAt,
          rawCreateResponse: beamResult.rawResponse as any,
          idempotencyKey,
        })
```

- [ ] **Step 6: Gate the LINE Flex push to PromptPay only**

Find the LINE Flex block (around line 227). It currently always runs. Wrap the entire `try { ... } catch (lineErr) { ... }` block in a conditional:

Before:

```ts
    try {
      const base = publicBaseUrl;
      const qrCodeImageUrl = base ? toPublicQrImageUrl(inserted.id, inserted.qrPayload, base) : null;
      const qrOk = await canFetchPublicImage(qrCodeImageUrl);
      // ... rest of flex code
    } catch (lineErr) {
      const msg = lineErr instanceof Error ? lineErr.message : String(lineErr);
      console.warn("[line-flex] payment qr send failed (new):", msg);
    }
```

After:

```ts
    if (methodDef.id === "promptpay") {
      try {
        const base = publicBaseUrl;
        const qrCodeImageUrl = base ? toPublicQrImageUrl(inserted.id, inserted.qrPayload, base) : null;
        const qrOk = await canFetchPublicImage(qrCodeImageUrl);
        // ... rest of flex code unchanged
      } catch (lineErr) {
        const msg = lineErr instanceof Error ? lineErr.message : String(lineErr);
        console.warn("[line-flex] payment qr send failed (new):", msg);
      }
    }
```

(Only the wrapping `if` is added. Everything inside the try/catch stays byte-for-byte unchanged.)

- [ ] **Step 7: Extend the success response payload**

Find the final `return NextResponse.json({ ok: true, data: { ... } })` (around line 252). Add three fields to the `data` object:

Before:

```ts
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
```

After:

```ts
    return NextResponse.json({
      ok: true,
      data: {
        paymentId: inserted.id,
        amount: inserted.amount,
        currency: inserted.currency,
        paymentMethod: inserted.paymentMethod,
        qrPayload: inserted.qrPayload,
        redirectUrl: inserted.redirectUrl,
        actionRequired: beamResult.actionRequired,
        expiresAt: inserted.expiresAt?.toISOString() ?? null,
        status: inserted.status,
      },
    });
```

- [ ] **Step 8: Apply the same fields in the race-recovery branch**

Find the `if (survivor) { ... }` block (around line 199) that also returns a JSON response. Update its `data` object the same way:

Before:

```ts
          return NextResponse.json({
            ok: true,
            data: {
              paymentId: survivor.id,
              amount: survivor.amount,
              currency: survivor.currency,
              qrPayload: survivor.qrPayload,
              expiresAt: survivor.expiresAt?.toISOString() ?? null,
              status: survivor.status,
            },
          });
```

After:

```ts
          return NextResponse.json({
            ok: true,
            data: {
              paymentId: survivor.id,
              amount: survivor.amount,
              currency: survivor.currency,
              paymentMethod: survivor.paymentMethod,
              qrPayload: survivor.qrPayload,
              redirectUrl: survivor.redirectUrl,
              actionRequired:
                survivor.redirectUrl ? "REDIRECT" : survivor.qrPayload ? "ENCODED_IMAGE" : "NONE",
              expiresAt: survivor.expiresAt?.toISOString() ?? null,
              status: survivor.status,
            },
          });
```

- [ ] **Step 9: Type-check the user app**

Run: `pnpm --filter @quickload/user exec tsc --noEmit`
Expected: Exit code 0.

- [ ] **Step 10: Lint**

Run: `pnpm --filter @quickload/user lint`
Expected: No new errors.

- [ ] **Step 11: Commit**

```bash
git add apps/user/app/api/payment/charges/route.ts
git commit -m "accept paymentMethod in create-charge route"
```

---

## Task 5: Return `paymentMethod`, `actionRequired`, `redirectUrl` from GET status route

**Files:**
- Modify: `apps/user/app/api/payment/charges/[id]/route.ts`

- [ ] **Step 1: Add the three fields to the response payload**

Open `apps/user/app/api/payment/charges/[id]/route.ts`. Find the final `return NextResponse.json({ ok: true, data: { ... } })` (around line 84). Add three fields to `data`:

Before:

```ts
    return NextResponse.json({
      ok: true,
      data: {
        paymentId: paymentRow.id,
        status: effectiveStatus,
        amount: paymentRow.amount,
        currency: paymentRow.currency,
        qrPayload: paymentRow.qrPayload,
        expiresAt: paymentRow.expiresAt?.toISOString() ?? null,
        paidAt: paymentRow.paidAt?.toISOString() ?? null,
        parcelId: parcelRow.id,
        barcode: parcelRow.barcode,
        trackingId: parcelRow.trackingId,
        outstanding: { ... },
      },
    });
```

After (only three new fields — others unchanged):

```ts
    return NextResponse.json({
      ok: true,
      data: {
        paymentId: paymentRow.id,
        status: effectiveStatus,
        amount: paymentRow.amount,
        currency: paymentRow.currency,
        paymentMethod: paymentRow.paymentMethod,
        qrPayload: paymentRow.qrPayload,
        redirectUrl: paymentRow.redirectUrl,
        actionRequired:
          paymentRow.redirectUrl ? "REDIRECT" : paymentRow.qrPayload ? "ENCODED_IMAGE" : "NONE",
        expiresAt: paymentRow.expiresAt?.toISOString() ?? null,
        paidAt: paymentRow.paidAt?.toISOString() ?? null,
        parcelId: parcelRow.id,
        barcode: parcelRow.barcode,
        trackingId: parcelRow.trackingId,
        outstanding: { ... unchanged ... },
      },
    });
```

(Leave the `outstanding` object untouched.)

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @quickload/user exec tsc --noEmit`
Expected: Exit code 0.

- [ ] **Step 3: Commit**

```bash
git add apps/user/app/api/payment/charges/[id]/route.ts
git commit -m "return paymentMethod and redirect fields from charge status"
```

---

## Task 6: Add method-switch tiles + REDIRECT UI on /pay/[parcelId]

**Files:**
- Modify: `apps/user/app/pay/[parcelId]/page.tsx`

This is the biggest UI change. Work in three sub-steps: (a) extend the local type, (b) add the switch logic, (c) render the tiles and REDIRECT button.

- [ ] **Step 1: Import the registry and extend the local `ChargeData` type**

At the top of `apps/user/app/pay/[parcelId]/page.tsx`, add the registry import:

```ts
import { PAYMENT_METHODS, type PaymentMethodId } from "@quickload/shared/payment-methods";
```

Then find the existing `ChargeData` type (around line 32) and extend it:

Before:

```ts
type ChargeData = {
  paymentId: string;
  status: ChargeStatus;
  amount: string;
  currency: string;
  qrPayload: string | null;
  expiresAt: string | null;
  paidAt: string | null;
  parcelId: string;
  barcode: string | null;
  trackingId: string | null;
  outstanding: Outstanding;
};
```

After:

```ts
type ActionRequired = "NONE" | "REDIRECT" | "ENCODED_IMAGE";

type ChargeData = {
  paymentId: string;
  status: ChargeStatus;
  amount: string;
  currency: string;
  paymentMethod: PaymentMethodId | string;
  qrPayload: string | null;
  redirectUrl: string | null;
  actionRequired: ActionRequired;
  expiresAt: string | null;
  paidAt: string | null;
  parcelId: string;
  barcode: string | null;
  trackingId: string | null;
  outstanding: Outstanding;
};
```

- [ ] **Step 2: Add a `switching` state and a `switchMethod` callback**

Inside the `PayPage` component, find the existing state hooks (around lines 52–60). Add a `switching` state right after `canceling`:

```ts
  const [switching, setSwitching] = useState<PaymentMethodId | null>(null);
```

Then, after the existing `handleCancel` definition (around line 196), add this new callback:

```ts
  const switchMethod = useCallback(
    async (nextMethod: PaymentMethodId) => {
      if (!charge || switching) return;
      setSwitching(nextMethod);
      setError(null);
      try {
        // Best-effort cancel of the current pending charge — server-side
        // expire-on-create will catch us either way.
        try {
          if (charge.paymentId) {
            await fetch(`/api/payment/charges/${charge.paymentId}/cancel`, {
              method: "POST",
            });
          }
        } catch {
          // ignore
        }

        const res = await fetch("/api/payment/charges", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parcelId, paymentMethod: nextMethod }),
        });
        const json = (await res.json()) as
          | { ok: true; data: { paymentId: string } }
          | { ok: false; error: string };
        if (!res.ok || !("ok" in json) || !json.ok) {
          setError(
            ("error" in json && json.error) || "ไม่สามารถเปลี่ยนวิธีชำระเงินได้",
          );
          return;
        }
        const statusRes = await fetch(`/api/payment/charges/${json.data.paymentId}`);
        const statusJson = (await statusRes.json()) as
          | { ok: true; data: ChargeData }
          | { ok: false; error: string };
        if (!statusRes.ok || !("ok" in statusJson) || !statusJson.ok) {
          setError(
            ("error" in statusJson && statusJson.error) || "ไม่สามารถโหลดสถานะได้",
          );
          return;
        }
        setCharge(statusJson.data);
        setQrDataUrl(null);
        if (statusJson.data.qrPayload) {
          await renderQr(statusJson.data.qrPayload);
        }
      } catch {
        setError("เครือข่ายผิดพลาด กรุณาลองใหม่");
      } finally {
        setSwitching(null);
      }
    },
    [charge, parcelId, renderQr, switching],
  );
```

- [ ] **Step 3: Auto-redirect on mobile when actionRequired is REDIRECT**

Still inside `PayPage`, add this effect right after the existing "Countdown tick" effect (around line 193):

```ts
  // Auto-open the bank/wallet app on mobile when the charge is a redirect.
  useEffect(() => {
    if (!charge || charge.actionRequired !== "REDIRECT" || !charge.redirectUrl) return;
    if (charge.status !== "pending") return;
    if (typeof window === "undefined") return;
    const isCoarse =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
    if (!isCoarse) return;
    const url = charge.redirectUrl;
    const t = setTimeout(() => {
      window.location.assign(url);
    }, 500);
    return () => clearTimeout(t);
  }, [charge]);
```

- [ ] **Step 4: Render the REDIRECT button when the current charge needs one**

Find the main `<div className="rounded-lg bg-white p-5 shadow-sm">` block (around line 271). Inside, the existing pending branch is:

```tsx
) : charge?.status === "pending" ? (
  <div className="flex flex-col items-center gap-3">
    {/* ... QR card with PromptPay UI ... */}
  </div>
```

Wrap the existing content with a conditional. Replace the whole `charge?.status === "pending"` branch's body with this structure (keeping the existing QR JSX nested under the `actionRequired !== "REDIRECT"` branch):

```tsx
) : charge?.status === "pending" ? (
  charge.actionRequired === "REDIRECT" && charge.redirectUrl ? (
    <div className="flex flex-col items-center gap-3 py-6">
      <p className="text-sm font-medium text-slate-500">ยอดที่ต้องชำระ</p>
      <p className="text-4xl font-semibold leading-none text-[#2726F5]">
        ฿ {formattedAmount}
      </p>
      <a
        href={charge.redirectUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex w-full max-w-xs items-center justify-center rounded-md bg-[#2726F5] px-4 py-3 text-base font-medium text-white shadow-[0_6px_14px_rgba(39,38,245,0.28)]"
      >
        เปิดแอป {methodLabelTh(charge.paymentMethod)}
      </a>
      <p className="text-xs text-slate-500">
        กลับมาที่หน้านี้หลังชำระเสร็จ
      </p>
    </div>
  ) : (
    <div className="flex flex-col items-center gap-3">
      {/* ↓↓↓ ENTIRE existing PromptPay QR JSX goes here unchanged ↓↓↓ */}
    </div>
  )
```

To complete this, **leave the existing QR JSX in place** but indent it inside the new `else` branch. No content inside the existing QR block changes. (Take your time with the JSX braces — they're sensitive.)

- [ ] **Step 5: Add the method-switch tile row**

The tile row appears below the QR/Redirect card, only when the charge is `pending`. Find the closing `</div>` of the white card and look for where the page returns the section content (around line 410 or wherever the white card closes). Directly **after** the white card's closing `</div>` and **before** the existing two-column `<div className="grid grid-cols-2 gap-3">` that holds the "ดูรายการพัสดุ" / "สร้างรายการใหม่" links — wait, those buttons don't exist on this page; this page has none of those.

Instead, locate the end of the `<div className="rounded-lg bg-white p-5 shadow-sm">` block (the one that holds the QR/Redirect content). Add this **immediately after** that closing `</div>`:

```tsx
          {charge?.status === "pending" ? (
            <div className="rounded-lg bg-white p-4 shadow-sm">
              <p className="mb-3 text-sm font-medium text-slate-700">
                เปลี่ยนวิธีชำระเงิน
              </p>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.filter(
                  (m) => m.id !== charge.paymentMethod,
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => switchMethod(m.id)}
                    disabled={switching !== null}
                    className="flex flex-col items-start rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-left transition hover:border-slate-300 hover:bg-slate-100 disabled:opacity-50"
                  >
                    <span className="text-sm font-medium text-slate-800">
                      {m.labelTh}
                    </span>
                    <span className="mt-0.5 text-[11px] text-slate-500">
                      {m.id === "promptpay" ? "สแกน QR" : "ชำระผ่านแอป"}
                    </span>
                    {switching === m.id ? (
                      <span className="mt-1 text-[11px] text-[#2726F5]">
                        กำลังเปลี่ยน...
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
```

- [ ] **Step 6: Add the `methodLabelTh` helper**

At the top of the file (with the other module-level helpers like `formatTHB`), add:

```tsx
function methodLabelTh(id: string): string {
  const def = PAYMENT_METHODS.find((m) => m.id === id);
  return def?.labelTh ?? id;
}
```

(If there's no helpers section, define it right above the `PayPage` component.)

- [ ] **Step 7: Type-check**

Run: `pnpm --filter @quickload/user exec tsc --noEmit`
Expected: Exit code 0.

- [ ] **Step 8: Lint**

Run: `pnpm --filter @quickload/user lint`
Expected: No new errors.

- [ ] **Step 9: Commit**

```bash
git add apps/user/app/pay/[parcelId]/page.tsx
git commit -m "add payment-method switcher and redirect UX to /pay"
```

---

## Task 7: Manual verification against Beam playground

**Files:** None — this is a manual integration step. **Do not skip.**

The spec marks several details as TBD because Beam's public docs only document `QR_PROMPT_PAY` in full. Use the playground to confirm them.

- [ ] **Step 1: Verify env points to Beam playground**

Check `apps/user/.env.local`:

```
BEAM_API_BASE_URL=https://playground.api.beamcheckout.com
```

If it's pointing at production, switch to playground for this task.

- [ ] **Step 2: Start the dev server**

Run: `pnpm --filter @quickload/user dev`
Expected: Server up at http://0.0.0.0:3020.

- [ ] **Step 3: For each new method, create a charge and inspect Beam's response**

For each of the four methods (`kplus`, `make`, `scb_easy`, `truemoney`):

1. Open or create a parcel that has a confirmed price (status `pending_payment`).
2. Navigate to `/pay/<parcelId>` and tap the corresponding tile.
3. Inspect the Beam response in your server logs (the `rawCreateResponse` column captures it). Note:
   - Did Beam accept the request body? If `400`, the per-method key (`kplus` / `make` / `scbEasy` / `trueMoney`) or its body shape needs adjustment.
   - What is the actual value of `actionRequired` in the response? Is it `"REDIRECT"` or something else?
   - Where exactly is `redirectUrl` located in the response? Top-level? Under `nextAction`? Under `paymentMethod.<key>`?

- [ ] **Step 4: If discrepancies found, fix them**

Edit `packages/shared/src/beam.ts`:
- Adjust the per-method body in the `switch (paymentMethodType)` block if Beam expects different keys/fields.
- Add the new path to `extractRedirectUrl` if `redirectUrl` lives somewhere our extractor doesn't check.
- Add the new `actionRequired` literal to `extractActionRequired` if Beam uses a non-standard string.

Re-run Step 3 until each of the four methods produces a row with non-null `redirect_url` (or `qr_payload` if a method returns ENCODED_IMAGE).

- [ ] **Step 5: Verify the redirect URL opens the right app on a physical device**

For at least one method, open `/pay/<parcelId>` on a real phone in the LINE LIFF webview (or a regular mobile browser). Confirm:
- The "เปิดแอป {label}" button is visible.
- Auto-redirect fires after ~500ms and opens the bank/wallet app.
- Completing payment in the app and returning to LIFF causes the page to poll and redirect to `/send/success`.

- [ ] **Step 6: Verify PromptPay still works (regression)**

Open `/pay/<newParcelId>` without tapping any tile. Confirm:
- The PromptPay QR loads automatically (same as today).
- LINE Flex message with the QR card is pushed (same as today).
- Scanning + paying still flips the row to `succeeded`.

- [ ] **Step 7: Commit any fixes**

```bash
git add packages/shared/src/beam.ts
git commit -m "tune beam request/response shapes for app-based methods"
```

(Skip this commit if Step 4 made no changes.)

---

## Self-Review

After writing the plan above, here is the pass against the spec:

**Spec coverage:**
- §3 (Internal identifiers) → Task 1 (registry)
- §4.1 (payment-methods.ts) → Task 1
- §4.2 (generalize Beam call) → Task 3
- §4.3 (POST route) → Task 4
- §4.4 (GET route) → Task 5
- §4.5 (UI) → Task 6
- §5 (data model: new `redirect_url` column) → Task 2
- §7 (error handling cases) → covered by Task 4 (validation), Task 6 (`switching` disable, fallback for unknown actionRequired via the `methodLabelTh` + redirect button branch)
- §8 (testing: unit tests) → adapted to manual verification + type-check + lint in Task 7 because the repo has no test framework. This is a deliberate scope decision noted at the top of the plan.
- §9 (implementation order) → Tasks 1–7 follow the order, except step 3 (migration) is moved to Task 2 so the schema lands before the route changes that use it.
- §10 (open questions) → Task 7 directly addresses each.

**Placeholder scan:** No TBDs or "add error handling later" in the steps. The TBDs in the spec for Beam's per-method body shape are resolved by Task 7's manual verification — that's the right place for them since they depend on live Beam responses, not code analysis.

**Type consistency:**
- `PaymentMethodId` defined in Task 1, used in Tasks 4 and 6. ✓
- `BeamPaymentMethodType` defined in Task 1, imported via `import type` in Task 3. ✓
- `BeamChargeResult` type expanded in Task 3 with `redirectUrl`, `actionRequired`. Used in Task 4. ✓
- `ChargeData` extended in Task 6 to match the GET route shape from Task 5. ✓
- `actionRequired` derivation rule (redirectUrl → REDIRECT, qrPayload → ENCODED_IMAGE, else NONE) is consistent in Tasks 4 (race-recovery branch), 5 (GET route), and Task 3 (`extractActionRequired` fallback). ✓
