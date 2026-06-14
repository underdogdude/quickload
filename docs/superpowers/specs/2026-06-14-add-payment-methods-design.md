# Add KPLUS / MAKE / SCB_EASY / TRUE_MONEY Payment Methods

Date: 2026-06-14
Scope: `apps/user` payment flow on `/pay/[parcelId]`
Status: Design

## 1. Goal

Add four additional Beam-supported payment methods alongside the existing PromptPay flow so users can pay parcel charges with their preferred bank/wallet app.

New methods (Beam `paymentMethodType` shown in parentheses):

- K PLUS (`KPLUS`)
- MAKE by KBank (`MAKE`)
- SCB Easy (`SCB_EASY`)
- TrueMoney Wallet (`TRUE_MONEY`)

Existing PromptPay (`QR_PROMPT_PAY`) remains the default; the four new methods are alternates the user can switch to from `/pay/[parcelId]`.

## 2. Out of scope

- LINE Flex message changes — the QR-centric Flex push remains active for PromptPay only. New methods skip Flex entirely. The Flex code itself is not touched.
- The `/payment` summary/history page — no UI change. History rows for new methods will display the human label via a small map, nothing else.
- Admin UI changes.
- DB schema change — `payments.payment_method` is already a free-form `text` column; no migration.
- Method-availability pre-flight checks — we attempt the create and surface a friendly error if Beam rejects it.
- Brand-accurate logo icons — placeholder text-label tiles are used initially. Real icon swap is a follow-up.

## 3. Internal identifiers

Stored in `payments.payment_method`. Lowercase, matching the existing `"promptpay"` convention.

| Internal id    | Beam `paymentMethodType` | Display label (Thai) |
| -------------- | ------------------------ | -------------------- |
| `promptpay`    | `QR_PROMPT_PAY`          | พร้อมเพย์           |
| `kplus`        | `KPLUS`                  | K PLUS              |
| `make`         | `MAKE`                   | MAKE by KBank       |
| `scb_easy`     | `SCB_EASY`               | SCB Easy            |
| `truemoney`    | `TRUE_MONEY`             | TrueMoney Wallet    |

## 4. Architecture

### 4.1 New module: `packages/shared/src/payment-methods.ts`

Single source of truth for the registry above. Exports:

```ts
export type PaymentMethodId = "promptpay" | "kplus" | "make" | "scb_easy" | "truemoney";

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

export const PAYMENT_METHODS: ReadonlyArray<PaymentMethodDef>;

export function getPaymentMethod(id: string): PaymentMethodDef | null;
```

Consumed by the charges POST route, the charges GET route (for label-in-response convenience), and the `/pay` UI for rendering tiles.

### 4.2 Generalize Beam call: `packages/shared/src/beam.ts`

- Rename `createBeamPromptPayCharge` → `createBeamCharge`.
- New required param: `paymentMethodType: BeamPaymentMethodType`.
- Body is built by switching on `paymentMethodType`:
  - `QR_PROMPT_PAY` → `paymentMethod: { paymentMethodType, qrPromptPay: { expiryTime } }` (unchanged from today).
  - `KPLUS` → `paymentMethod: { paymentMethodType, kplus: {} }` **(TBD: confirm key + required fields in Beam playground during implementation)**.
  - `MAKE` → `paymentMethod: { paymentMethodType, make: {} }` **(TBD)**.
  - `SCB_EASY` → `paymentMethod: { paymentMethodType, scbEasy: {} }` **(TBD)**.
  - `TRUE_MONEY` → `paymentMethod: { paymentMethodType, trueMoney: {} }` **(TBD)**.
- Return type expands:

```ts
export type BeamChargeResult = {
  chargeId: string;
  qrPayload: string | null;          // null when actionRequired !== "ENCODED_IMAGE"
  redirectUrl: string | null;        // populated when actionRequired === "REDIRECT"
  actionRequired: "NONE" | "REDIRECT" | "ENCODED_IMAGE";
  expiresAt: string | null;
  rawResponse: unknown;
};
```

- Existing `extractQrPayload` stays. Add `extractRedirectUrl(obj)` that checks (in order): top-level `redirectUrl`, `nextAction.redirectUrl`, `actionRequired.redirectUrl`, and `paymentMethod.<key>.redirectUrl` for the four new method keys. Returns `null` if none present.
- `actionRequired` extracted from top-level `actionRequired` field (string), uppercased and normalized to one of the three values; unknown strings map to `"NONE"` with a console.info log.
- Existing call site (`apps/user/app/api/payment/charges/route.ts`) updated to pass `paymentMethodType: "QR_PROMPT_PAY"` for the PromptPay path. PromptPay behavior is byte-for-byte unchanged.

### 4.3 API route: `apps/user/app/api/payment/charges/route.ts` (POST)

- Request body shape becomes:

```ts
type CreateChargeBody = {
  parcelId?: string;
  paymentMethod?: PaymentMethodId;   // defaults to "promptpay"
};
```

- Validate `paymentMethod` via `getPaymentMethod(...)`. Unknown value → `400 "Unsupported payment method"`.
- Existing pre-checks (parcel ownership, status, price, outstanding) unchanged.
- Existing "expire any pending row for this parcel" UPDATE unchanged — this is what makes method switching safe.
- Call `createBeamCharge` with the mapped `beamType`.
- Insert `payments` row: `paymentMethod` = selected id (not hardcoded `"promptpay"` anymore); other columns unchanged.
- Response payload adds `paymentMethod`, `actionRequired`, `redirectUrl`. `qrPayload` remains (null for redirect-only methods).
- **LINE Flex push: gated to `paymentMethod === "promptpay"`.** Everything else: skip Flex. Existing Flex code is not modified.

### 4.4 API route: `apps/user/app/api/payment/charges/[paymentId]/route.ts` (GET)

- Response gains: `paymentMethod`, `actionRequired`, `redirectUrl`. (Currently it returns only QR-relevant fields.)
- `paymentMethod` and `redirectUrl` come from the persisted row. `actionRequired` is derived (rules in §5) — not persisted.

### 4.5 UI: `apps/user/app/pay/[parcelId]/page.tsx`

- On mount: auto-create PromptPay charge — unchanged.
- Beneath the existing QR card, add a **"เปลี่ยนวิธีชำระเงิน"** section: a 2-column grid of four placeholder text tiles (K PLUS / MAKE / SCB Easy / TrueMoney). Each tile is a `<button>` with the method label and a subtle subtitle ("ชำระผ่านแอป").
- On tile tap:
  1. Set `switching = true`; disable all tiles.
  2. POST `/api/payment/charges/[currentPaymentId]/cancel`. Failure is non-fatal (server-side expire-on-create will catch it).
  3. POST `/api/payment/charges` with `{ parcelId, paymentMethod: <selected id> }`.
  4. GET `/api/payment/charges/[newPaymentId]` to load full status.
  5. Replace local `charge` state. Reset `switching`.
- If new charge's `actionRequired === "REDIRECT"`:
  - Hide the QR/PromptPay card UI; render a "เปิดแอป {label}" primary button linking to `redirectUrl` (`<a href target="_blank" rel="noopener">`).
  - On mobile (`window.matchMedia('(pointer: coarse)').matches`), call `window.location.assign(redirectUrl)` ~500ms after the page renders the button. The button itself remains visible on return.
  - Show a small caption: "กลับมาที่หน้านี้หลังชำระเสร็จ" so the user knows polling will pick up the success.
- Polling: unchanged. The existing 2.5s poll already handles all statuses.
- Countdown timer (`expiresAt`): shown for PromptPay; hidden for redirect-only flows (Beam's expiry there is less user-visible).
- If `actionRequired === "ENCODED_IMAGE"` for any method (some banks may behave this way): treat exactly like PromptPay — render the QR.
- Unknown `actionRequired`: fall back to a generic "เปิดในแอปธนาคาร" + redirect button if `redirectUrl` exists, else show a generic error.

### 4.6 Webhook handler

No changes. It already routes by `providerChargeId` and is method-agnostic.

## 5. Data model

No migration. `payments.payment_method` (existing `text` column, default `"promptpay"`) stores the new ids verbatim.

Add one new column **only if** the redirect URL needs to persist across page reloads (the user may close LIFF, reopen, and we want the same button). Spec recommendation: **add `payments.redirect_url text NULL`** in a single small migration (`supabase/migrations/<timestamp>_add_payment_redirect_url.sql`). Cheap, avoids re-creating charges on reload. The GET status route reads from this column.

`actionRequired` itself is **not** persisted — it's derived at read time:

- `qrPayload != null` → `"ENCODED_IMAGE"`
- `redirectUrl != null` → `"REDIRECT"`
- else → `"NONE"`

## 6. Data flow (new method, switching from PromptPay)

```
User on /pay/[parcelId] sees PromptPay QR (current behavior)
User taps "K PLUS" tile
  → POST /api/payment/charges/[currentPaymentId]/cancel  (best-effort)
  → POST /api/payment/charges { parcelId, paymentMethod: "kplus" }
     ├─ expire any pending row for this parcel
     ├─ createBeamCharge({ paymentMethodType: "KPLUS", ... })
     ├─ insert payments row { paymentMethod: "kplus", redirectUrl, qrPayload: null }
     └─ skip LINE Flex (gated to promptpay)
  → GET /api/payment/charges/[newPaymentId]
  → UI hides QR card, shows "เปิดแอป K PLUS" button
  → On mobile: window.location.assign(redirectUrl) after 500ms
  → User pays in K PLUS app
  → Beam webhook → markPaymentSucceeded() (unchanged)
  → Next poll sees "succeeded" → redirect to /send/success (unchanged)
```

## 7. Error handling

| Case                                            | Behavior                                                                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Beam returns 4xx/5xx (method not enabled, etc.) | API returns `502 "Payment provider unavailable"` (existing). Log includes `paymentMethodType` so we can identify which. |
| Unknown `actionRequired` value                  | API persists the row; UI falls back to generic "เปิดในแอปธนาคาร" + redirectUrl button if present, else error message.   |
| Cancel before create fails (network)            | Non-fatal. Server-side expire-on-create handles it via existing unique-index recovery.                                  |
| User on desktop picks app-only method           | Button shown; no auto-redirect (pointer: coarse is false). Tap opens redirectUrl in new tab — user choice.              |
| Double-tap method tile during switch            | All tiles disabled while `switching === true`. Re-enabled after response.                                               |
| Beam method not configured on merchant          | Surface Thai error message "วิธีชำระเงินนี้ยังไม่พร้อมใช้งาน กรุณาเลือกวิธีอื่น" mapped from 502.                       |
| User paid but webhook delayed                   | Existing `reconcilePendingPaymentFromBeamApi` polls Beam on GET. Unchanged.                                             |

## 8. Testing

### Unit tests

`packages/shared/src/beam.test.ts` (new or extended):

- `createBeamCharge` produces correct body for each `paymentMethodType`:
  - `QR_PROMPT_PAY` includes `qrPromptPay: { expiryTime }`
  - `KPLUS` includes `kplus: {}` (assertion will be updated post-playground if the key differs)
  - same for `MAKE`, `SCB_EASY`, `TRUE_MONEY`
- `extractRedirectUrl` against representative response shapes (top-level, nested under `paymentMethod.<key>`, missing → null)
- `extractQrPayload` regression: existing PromptPay responses still parse correctly

`packages/shared/src/payment-methods.test.ts` (new):

- `getPaymentMethod("kplus")` returns the right def
- `getPaymentMethod("invalid")` returns `null`
- `PAYMENT_METHODS` length is 5, ids are unique

### API route tests

`apps/user/app/api/payment/charges/route.test.ts`:

- POST without `paymentMethod` → defaults to `promptpay`, inserts row with that value (regression)
- POST with each new `paymentMethod` → row inserted with matching value, `provider: "beam"`
- POST with invalid `paymentMethod` (e.g., `"foo"`) → `400 "Unsupported payment method"`
- LINE Flex push is invoked **only** for `promptpay` (mock and assert call count = 0 for new methods)

### Manual verification against Beam playground (implementation step 7)

For each new method, exercise create-charge from a dev script or the playground and capture:

1. The exact key Beam expects under `paymentMethod` (kplus / make / scbEasy / trueMoney — or something else).
2. The `actionRequired` value returned (REDIRECT vs ENCODED_IMAGE vs NONE).
3. The exact location of `redirectUrl` in the response.
4. Whether any required fields exist inside the per-method object (return URL is already at top level; check for things like `appReturnUrl`, `bank`, etc.).

If any of these differ from this spec's assumptions, only the body-builder switch in `createBeamCharge` and `extractRedirectUrl` need adjustment — surface area is intentionally small.

### UI smoke test (manual, in LIFF)

- PromptPay still auto-loads on `/pay/[parcelId]` (regression).
- For each new tile: tap → old pending row goes to `expired` → new row created → page shows redirect button → mobile auto-redirects.
- Polling continues; webhook-triggered success redirects to `/send/success`.
- History list on `/payment` shows the human label for the new method.

## 9. Implementation order

1. Add `packages/shared/src/payment-methods.ts` + unit test.
2. Generalize Beam call to `createBeamCharge`; add `extractRedirectUrl`; expand return type. Existing call site updated. Tests.
3. Add `payments.redirect_url` migration (single column, nullable).
4. Update POST `/api/payment/charges` to accept `paymentMethod`; persist `redirectUrl`; gate LINE Flex push. Tests.
5. Update GET `/api/payment/charges/[paymentId]` to return `paymentMethod`, `actionRequired` (derived), `redirectUrl`.
6. UI: add method tile row below QR; cancel-then-create on tap; render redirect button + mobile auto-redirect.
7. Manual playground verification for each method; fine-tune body keys / extraction if needed.

## 10. Open questions (to resolve during implementation step 7)

- Exact `paymentMethod.<key>` body shape Beam expects per method. Public docs only show `qrPromptPay`. **Verify in Beam playground.**
- Exact location of `redirectUrl` for each method. Our extractor checks several common paths; add more if needed.
- Exact `actionRequired` string value (`"REDIRECT"` vs `"REDIRECT_TO_URL"` etc.). Beam's status docs use `"REDIRECT"`.
- Brand-accurate icons — placeholder text tiles ship first; icon swap is a follow-up PR.
