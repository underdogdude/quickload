Quickload Monorepo — Full AI Handoff Document
Product: Quickload — LINE LIFF parcel shipping app for Thailand (Thai Post / Smartpost integration)
Repo path: /Users/pusitkittiteeranurak/Desktop/line-pickup-monorepo
Package manager: pnpm 9.14.2 · Node: ≥18 · Monorepo: Turborepo

1. Executive summary
Quickload lets LINE users register, save sender/recipient addresses, create parcel orders via Smartpost addItem, track parcels via Thailand Post webhooks, and pay outstanding balances via Beam Checkout (PromptPay QR, etc.). There are two Next.js 14 apps:

App	Port (dev)	Audience	Auth
apps/user
3020
LINE LIFF customers
iron-session + LINE LIFF
apps/admin
3001
Staff dashboard
Supabase Auth
Shared DB schema, Drizzle ORM, and business logic live in packages/shared.

Language/UI: Thai-first UI (lang="th"), Kanit font, mobile-first (390×844 viewport in E2E).

2. Repository structure
line-pickup-monorepo/
├── apps/
│   ├── user/                 # Customer LIFF app (main product)
│   │   ├── app/              # Next.js App Router pages + API routes
│   │   ├── lib/              # Client/server utilities
│   │   ├── e2e/              # Playwright E2E (15 tests)
│   │   ├── middleware.ts     # Auth gate
│   │   ├── playwright.config.ts
│   │   └── vitest.config.ts
│   └── admin/                # Staff dashboard (parcels, pickups)
├── packages/
│   └── shared/               # Drizzle schema, beam, penalty, pricing, SQL migrations
├── supabase/                 # Local Supabase config
├── docs/                     # Specs, plans, Notion task docs
├── .github/workflows/ci.yml  # Lint + typecheck + unit tests (no E2E in CI yet)
├── turbo.json
├── package.json
└── .env.example
3. Tech stack
Layer	Choice
Framework
Next.js 14 App Router
UI
React 18, Tailwind CSS
DB
PostgreSQL (Supabase), Drizzle ORM
Session
iron-session (quickload_line_session cookie)
LINE
@line/liff, Messaging API (Flex messages)
Payments
Beam Checkout (HMAC webhooks)
Carrier
Smartpost webservice (addItem, getcost)
OTP
ThaiBulkSMS OTP API
Tests
Vitest 4 (247 unit tests), Playwright (15 E2E)
Deploy
Vercel (separate projects for user + admin)
4. High-level architecture
LINE In-App Browser
apps/user API Routes
External Services
PostgreSQL / Supabase
LIFF SDK
apps/user Next.js
/api/auth/line + OTP
/api/smartpost/add-item + /api/parcels/draft
/api/payment/*
/api/parcels/thai-post-webhook
LINE Profile + Messaging
Smartpost addItem / getcost
Beam Checkout
ThaiBulkSMS OTP
Thailand Post via Smartpost webhook
users, parcels, orders, payments, addresses
5. Authentication & session (critical for Android/LINE)
5.1 Middleware (apps/user/middleware.ts)
Dev bypass: If NODE_ENV !== "production" AND NEXT_PUBLIC_DEV_SKIP_LINE_AUTH=true → all routes pass (no session required).
Production: Unauthenticated users → /entry. Incomplete profile → /register (except /register/*).
Logged-in on /entry → redirect to / or /register.
5.2 Entry flow (apps/user/app/entry/page.tsx)
Optional 6s timeout pre-check: GET /api/me — if session exists, hard nav to / or /register.
Dynamic import @line/liff → liff.init() → liff.login() if needed.
POST /api/auth/line with access token (15s timeout) → upsert user in DB, set iron-session.
Hard navigation via navigateAfterAuth(router, href, { hard: true }) → window.location.replace().
Why hard nav matters: Soft router.replace() in LINE WebView can race with middleware; cookie may not be visible yet → infinite spinner on /entry. This was a reported production bug on first-time Android login.

5.3 Session shape (apps/user/lib/session.ts)
interface LineAppSession {
  lineUserId?: string;
  userId?: string;
  displayName?: string;
  pictureUrl?: string | null;
  profileCompleted?: boolean;
  phoneOtpToken?: string;
  phoneOtpPhone?: string;
  phoneOtpRequestedAt?: number;
  phoneOtpVerifiedFor?: string;  // normalized 0xxxxxxxxx
}
Required env: IRON_SESSION_PASSWORD (≥32 chars) or server throws on boot.

5.4 Registration flow
/register — form: firstName, lastName, phone, email, birthDate (HTML required).
Phone change requires OTP → savePendingProfile() in sessionStorage → /register/verify-phone?phone=....
POST /api/auth/otp/request → ThaiBulkSMS (15s timeout on client).
POST /api/auth/otp/verify → sets session.phoneOtpVerifiedFor.
PATCH /api/me with pending profile (gated by _patch-profile-logic.ts).
Hard nav to /.
Key files:

lib/pending-profile.ts — sessionStorage bridge
lib/thai-phone.ts — normalize/validate Thai phones
lib/thaibulksms-otp.ts — OTP API client
app/api/auth/otp/_otp-session-logic.ts — extracted testable logic
6. Send parcel flow (order creation)
Fill weight, dimensions, addresses
router.push with query params
POST (30s client timeout)
Smartpost addItem HTTP 201
POST with smartpostAddItemResponse (20s timeout)
Insert parcels + orders
pushLineMessage (fire-and-forget, non-blocking)
{ id, trackingId }
window.location.replace(/parcels/{id})
User
/send
/send/review
/api/smartpost/add-item
/api/parcels/draft
LINE Messaging
6.1 /send (app/send/page.tsx)
Client page: sender/recipient from address book, weight (10–30,000g), dimensions (per-side ≤60cm, sum ≤120cm).
Wrapped by SendAccessGuard in app/send/layout.tsx.
SendAccessProvider only renders when getCurrentUser() returns logged-in (in LoggedInShell).
6.2 Send access block (lib/send-access-ui.tsx + lib/send-access-block.ts)
GET /api/send/access → { blocked, overdueParcelCount, message }.
Blocked when: parcel has thaiPostPriceConfirmedAt, outstanding > 0, and ≥24h since price confirmation (SEND_ACCESS_BLOCK_AFTER_MS).
SendAccessGuard shows full-page block UI on /send/* (except /send/success).
SendLink intercepts nav to /send and shows modal if blocked.
6.3 /send/review (app/send/review/page.tsx)
Loads addresses, fetches /api/pricing/estimate for estimated price.
onConfirmCreateOrder:
Smartpost add-item (30s AbortController)
Draft create (20s AbortController)
window.location.replace(/parcels/{id}) — hard nav for Android
Fallback link "ดูออเดอร์ที่สร้างแล้ว" if order saved but nav stalls
6.4 /api/smartpost/add-item (app/api/smartpost/add-item/route.ts)
Validates sender/recipient belong to user.
POST to Smartpost with Basic auth.
Success: HTTP 201 OR body statuscode: "201".
Bug fix applied: spread order { ...body, statuscode: "201" } so upstream body cannot override success status.
Returns normalized { ok: true, data: { statuscode: "201", ... } }.
6.5 /api/parcels/draft (app/api/parcels/draft/route.ts)
Requires smartpostAddItemResponse in body — no parcel without Smartpost success.
Parses via lib/smartpost-add-item.ts.
Creates parcels row: status: "awaiting_actual_weight", price: null.
Creates orders row with Smartpost snapshot fields.
Sends LINE Flex order success message via void pushLineMessage(...) (non-blocking — critical for slow Android).
7. Parcel lifecycle & pricing
Stage	Parcel status	Price
Order created
awaiting_actual_weight
null
Thailand Post weighs at branch
webhook updates
price set from pricing tiers
Unpaid after 24h from price confirm
—
send blocked
Paid
paid / isPaid: true
—
7.1 Thailand Post webhook (/api/parcels/thai-post-webhook)
Receives Smartpost relay of Thailand Post tracking updates.
Auth: SMARTPOST_WEBHOOK_SECRET (HMAC) or fallback THAI_POST_WEBHOOK_TOKEN.
Updates parcels.status, parcels.price, thaiPostPriceConfirmedAt.
Uses pricing_tiers table + lookupSellPriceThbForWeight.
Sends LINE Flex (status update, payment due).
Stores history in thai_post_webhook_events.
7.2 Display codes
resolveParcelDisplayCode() in @quickload/shared/parcel-display-code — barcode vs smartpost tracking vs trackingId.
8. Payment flow
8.1 Pages
Route	Purpose
/payment
Outstanding list + payment history tabs
/pay/[parcelId]
Single parcel PromptPay QR
/pay/all
Bulk pay multiple parcels
8.2 API
Route	Purpose
GET /api/payment/outstanding
Returns { items[], totalOutstanding, itemCount, updatedAt }
GET /api/payment/charges?parcelId=
Check if charge needed
POST /api/payment/charges
Create Beam charge
GET /api/payment/charges/[id]
Poll charge status
GET /api/payment/charges/[id]/qr.png
Branded QR PNG
POST /api/payment/charges/bulk
Bulk charge
POST /api/payment/beam-webhook
HMAC-verified Beam events
POST /api/payment/sweep-abandoned
Cron: expire stale charges (CRON_SECRET)
8.3 Beam webhook (app/api/payment/beam-webhook/route.ts)
Verifies x-beam-signature with BEAM_WEBHOOK_HMAC_KEY.
Handles charge.succeeded, charge.failed, charge.expired, charge.canceled.
Updates payments table; sends LINE Flex on success/failure.
8.4 QR save (lib/save-promptpay-qr-image.ts)
Three strategies for Android LINE WebView:

navigator.share({ files }) — preferred
window.open(blobUrl) if Android + LINE UA detected
anchor[download] with delayed revokeObjectURL (2s) — sync revoke broke Android downloads
9. Layout & shell architecture
app/layout.tsx (server)
user.loggedIn ? (
  <LoggedInShell>  // SendAccessProvider
    <UserHeader />
    {children}
    <BottomNav />
  </LoggedInShell>
) : (
  <div>{children}</div>  // /entry, /register — no nav
)
E2E implication: Pages using SendAccessProvider (/send, /payment with SendLink) need a real session cookie. E2E uses POST /api/dev/e2e-session (dev only) + mocks.

10. User app pages (route map)
Route	Type	Notes
/entry
Client
LIFF login gate
/
Server
Home dashboard
/register
Client
Profile form
/register/verify-phone
Client
OTP (6 digits, auto-submit)
/send
Client
Parcel form
/send/review
Client
Confirm + create order
/send/sender, /send/recipient
Client
Address forms
/send/success
Client
Post-send (skips SendAccessGuard)
/addresses
Server
Address book (DB query)
/parcels
Client
List
/parcels/[id]
Client
Detail, label PDF, tracking
/payment
Client
Outstanding + history
/pay/[parcelId]
Client
PromptPay QR + poll
/pay/all
Client
Bulk payment
/pickup
—
Pickup booking
/manual, /help
—
Static/help
11. API routes catalog (apps/user/app/api/)
Auth: auth/line, auth/otp/request, auth/otp/verify
User: me (GET/PATCH)
Addresses: sender-addresses, recipient-addresses (+ [id])
Parcels: parcels, parcels/draft, parcels/[id], parcels/[id]/label.pdf, parcels/thai-post-webhook, parcels/thai-post-webhook/mock
Smartpost: smartpost/add-item
Payment: payment/outstanding, payment/history, payment/charges, payment/charges/[id], payment/charges/[id]/qr.png, payment/charges/[id]/cancel, payment/charges/bulk, payment/beam-webhook, payment/sweep-abandoned, payment/remind-unpaid, payment/remind-1h-after-price, payment/dev-simulate/[id]
Other: pricing/estimate, send/access, pickup, pickup/slots, thai-address, help/contact, open/parcel (flex token deep link)
Dev only: dev/e2e-session, dev/smartpost-add-item, dev/pricing-estimate

12. Database schema (key tables)
Defined in packages/shared/src/db/schema.ts:

Table	Purpose
users
LINE users, profile fields
parcels
Shipment records, price, status, amountPaid, thaiPostPriceConfirmedAt
orders
Smartpost addItem snapshot per parcel
sender_addresses, recipient_addresses
Address book
payments
Beam payment attempts
pricing_tiers
Weight → THB sell price
thai_post_webhook_events
Latest webhook + status_history JSONB
pickup_slots
Pickup scheduling
notification_log
LINE push audit
admin_users
Admin app
DB access: getDb() from @quickload/shared/db — requires DATABASE_URL.

Migrations: SQL files in packages/shared/sql/ + pnpm db:apply:* scripts.

13. Environment variables (complete reference)
See .env.example. Critical ones:

User app (apps/user/.env.local)
Variable	Purpose
DATABASE_URL
Postgres (pooler :6543 for hosted Supabase)
NEXT_PUBLIC_LIFF_ID
LINE LIFF app ID
IRON_SESSION_PASSWORD
Session encryption (≥32 chars)
LINE_CHANNEL_ACCESS_TOKEN / LINE_MESSAGING_CHANNEL_ACCESS_TOKEN
Push messages
NEXT_PUBLIC_APP_URL
Public URL for Beam redirects, Flex links (tunnel URL in dev)
BEAM_*
Merchant ID, API key, webhook HMAC
SMARTPOST_*
addItem + getcost credentials
THAIBULKSMS_OTP_API_KEY/SECRET
OTP
SMARTPOST_WEBHOOK_SECRET / THAI_POST_WEBHOOK_TOKEN
Webhook auth
CRON_SECRET
Cron endpoints
NEXT_PUBLIC_DEV_SKIP_LINE_AUTH
Dev only — skip middleware auth
NEXT_PUBLIC_SMARTPOST_MOCK
Dev mock weight simulation on /parcels
NEXT_PUBLIC_PAYMENT_MOCK
Dev simulate paid button
Dev tunnel / Cloudflare
next.config.mjs includes:

allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok.io", "*.ngrok-free.dev", "*.trycloudflare.com"]
Without this, /_next/* chunks return 404/403 when accessed via tunnel → hydration crash.

14. Testing
14.1 Unit tests (Vitest) — 247 tests, 13 files
cd apps/user
IRON_SESSION_PASSWORD="test-password-must-be-at-least-32-characters-long" pnpm test
Config: vitest.config.ts — environment: "node" default; jsdom via // @vitest-environment jsdom docblock in:

lib/pending-profile.test.ts
lib/save-promptpay-qr-image.test.ts
Note: environmentMatchGlobs was removed (invalid in Vitest 2+) — do not re-add.

Extracted logic modules (colocated _*-logic.ts):

app/api/auth/otp/_otp-session-logic.ts
app/api/me/_patch-profile-logic.ts
app/api/parcels/draft/_draft-logic.ts
app/api/smartpost/add-item/_add-item-logic.ts
14.2 E2E (Playwright) — 15 tests
cd apps/user
pnpm test:e2e
Config highlights (playwright.config.ts):

Port 3021 (not 3020) — dedicated E2E server
NEXT_PUBLIC_DEV_SKIP_LINE_AUTH=true + IRON_SESSION_PASSWORD in webServer env
workers: 1 — avoids Next dev server race conditions
reuseExistingServer: false
Helpers (e2e/helpers.ts):

loginAsTestUser() → POST /api/dev/e2e-session
mockMe, mockSendAccessAllowed, mockSendAccessBlocked
mockSingleParcelPayment, blockExternalLineRequests
Specs:

e2e/registration.spec.ts — register + OTP flows
e2e/send-parcel.spec.ts — send form, access block, dimension validation
e2e/payment.spec.ts — pay page, QR save, bulk pay
14.3 CI (.github/workflows/ci.yml)
Runs on main PR/push: typecheck, lint, unit tests. E2E not in CI yet.

14.4 Manual QA
apps/user/e2e/device-qa-checklist.md — iOS + Android LINE WebView checks (date input, QR save, LIFF, PDF label).

15. Admin app (apps/admin)
Port 3001
Supabase Auth for staff
Manages parcels, pickup slots
Cron in vercel.json (/api/cron/ping)
Less test coverage than user app
16. Shared package exports (@quickload/shared)
Important modules:

./db, ./db/schema — Drizzle
./beam — Beam Checkout + webhook HMAC
./penalty — outstanding computation
./send-access-block — 24h block rule
./pricing-tier-lookup — weight → price
./parcel-display-code, ./parcel-billable-price, ./parcel-note
./thai-post-status, ./thai-post-webhook-history
./bulk-payment, ./bulk-payment-db
17. Android / LINE WebView gotchas (recent fixes)
Issue	Cause	Fix
First login infinite spinner
Soft nav races middleware; /api/me no timeout
Hard nav + 6s pre-check timeout
Order created but page blank
await pushLineMessage blocked response; soft nav failed
Fire-and-forget LINE push; window.location.replace
QR save does nothing
revokeObjectURL sync after click; LINE ignores download
Delayed revoke; window.open fallback on Android LINE
OTP inputs hidden
Keyboard covers focused input
scrollIntoView({ block: "center" }) on focus
OTP send hangs
No fetch timeout
15s AbortController
/_next/* 404 via Cloudflare tunnel
allowedDevOrigins missing
Added *.trycloudflare.com
E2E SendAccessProvider is required
No session cookie in tests
POST /api/dev/e2e-session
Playwright parallel failures
Next dev server overload
workers: 1
18. Key files index (start here for common tasks)
Task	Files
Auth / entry
app/entry/page.tsx, middleware.ts, app/api/auth/line/route.ts, lib/navigate-after-auth.ts
Registration / OTP
app/register/page.tsx, app/register/verify-phone/page.tsx, lib/thaibulksms-otp.ts
Send parcel
app/send/page.tsx, app/send/review/page.tsx, app/api/smartpost/add-item/route.ts, app/api/parcels/draft/route.ts
Send block
lib/send-access-ui.tsx, lib/send-access-block.ts, app/api/send/access/route.ts
Payment
app/pay/[parcelId]/page.tsx, app/payment/page.tsx, app/api/payment/charges/route.ts, app/api/payment/beam-webhook/route.ts
Webhook / pricing
app/api/parcels/thai-post-webhook/route.ts, packages/shared/src/pricing-tier-lookup.ts
LINE Flex
lib/line-flex.ts, lib/line-messaging.ts
Session
lib/session.ts, lib/require-user.ts, lib/current-user.ts
E2E
e2e/helpers.ts, playwright.config.ts, app/api/dev/e2e-session/route.ts
Android CSS
app/globals.css (date input WebKit fixes)
19. Commands cheat sheet
# Install
pnpm install
# Dev (both apps)
pnpm dev
pnpm dev:user          # user only :3020
pnpm dev:user:clean    # rm .next + dev
# Tunnel (ngrok)
pnpm tunnel:user       # → localhost:3020
# Database
pnpm db:push
pnpm db:apply:payment-stack
pnpm db:studio
# Tests
pnpm test:user         # 247 unit tests
cd apps/user && pnpm test:e2e   # 15 E2E (port 3021)
# Typecheck
cd apps/user && pnpm exec tsc --noEmit
# Build
pnpm build
20. Uncommitted / in-progress work (git status snapshot)
At conversation time, many files were untracked or modified including:

New test files (*.test.ts, _*-logic.ts)
E2E specs + e2e/helpers.ts
playwright.config.ts, vitest.config.ts
.github/workflows/ci.yml
app/api/dev/e2e-session/route.ts
Fixes to entry/page.tsx, send/review/page.tsx, parcels/draft/route.ts, save-promptpay-qr-image.ts, verify-phone/page.tsx, next.config.mjs
Verify before deploy: run pnpm test + pnpm test:e2e, ensure env vars set on Vercel, never enable NEXT_PUBLIC_DEV_SKIP_LINE_AUTH in production.

21. Design docs in repo
docs/superpowers/specs/2026-04-25-late-payment-penalty-design.md
docs/superpowers/plans/2026-04-25-late-payment-penalty.md
docs/superpowers/plans/2026-06-14-add-payment-methods.md
docs/notion-phase1-tasks.md
22. Suggested next steps for incoming AI
Add E2E to CI once stable (single worker, install Playwright browsers).
Production monitoring for /entry hang rate and /send/review timeout rate on Android.
Consider wrapping liff.init() in its own timeout (currently only /api/auth/line has 15s).
Admin app — align test coverage with user app if staff flows are critical.
Do not use soft navigation after auth or order creation on LINE WebView without testing on real Android device.
This document reflects the codebase state after Android reliability fixes, full test suite setup, and E2E infrastructure. Copy it wholesale to the next AI provider as project context.
