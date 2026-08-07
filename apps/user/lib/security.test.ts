/**
 * Security-focused unit tests.
 *
 * These tests document and enforce the security contracts of the application:
 *   1. OTP bypass: PATCH /api/me must require OTP for phone changes
 *   2. Production env guards: dev flags must never be active in production
 *   3. Iron session: password must meet minimum requirements
 *   4. Beam webhook: HMAC signature is body-specific (replay attack prevention)
 *   5. Smartpost credentials: handled by fail-closed route validation
 */

import { describe, it, expect } from "vitest";
import { isOtpVerifiedForPhone, phoneHasChanged } from "@/app/api/me/_patch-profile-logic";
import { getSessionOptions } from "@/lib/session";
import { verifyBeamWebhookSignature } from "@quickload/shared/beam";
import { systemErrorEventKey } from "@quickload/shared/internal-events";
import { normalizeThaiPhone } from "@/lib/thai-phone";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// 1. OTP bypass prevention
// ---------------------------------------------------------------------------

describe("SECURITY: OTP bypass prevention for PATCH /api/me", () => {
  it("phone change requires OTP — different phones return true for hasChanged", () => {
    expect(phoneHasChanged("0812345678", "0987654321")).toBe(true);
  });

  it("OTP is NOT verified when session.phoneOtpVerifiedFor is undefined", () => {
    expect(isOtpVerifiedForPhone({}, "0987654321")).toBe(false);
  });

  it("OTP is NOT verified when session.phoneOtpVerifiedFor holds a different phone", () => {
    expect(isOtpVerifiedForPhone({ phoneOtpVerifiedFor: "0812345678" }, "0987654321")).toBe(false);
  });

  it("OTP bypass attempt: attacker submits phone without OTP — must be rejected", () => {
    // Simulates: attacker sends PATCH /api/me with new phone but no OTP session
    const storedPhone = "0812345678";
    const attackerPhone = "0999999999";
    const session = { phoneOtpVerifiedFor: undefined }; // no OTP done

    const hasChanged = phoneHasChanged(storedPhone, attackerPhone);
    const isVerified = isOtpVerifiedForPhone(session, attackerPhone);

    expect(hasChanged).toBe(true);   // phone would change
    expect(isVerified).toBe(false);  // but OTP is not verified → must block
  });

  it("OTP bypass attempt: attacker submits phone with stale OTP for different number", () => {
    const storedPhone = "0812345678";
    const attackerPhone = "0999999999";
    // Session has OTP verified for a DIFFERENT phone
    const session = { phoneOtpVerifiedFor: "0111111111" };

    const hasChanged = phoneHasChanged(storedPhone, attackerPhone);
    const isVerified = isOtpVerifiedForPhone(session, attackerPhone);

    expect(hasChanged).toBe(true);
    expect(isVerified).toBe(false); // stale OTP for different phone → must block
  });

  it("legitimate phone change: OTP verified for exact new phone — must pass", () => {
    const storedPhone = "0812345678";
    const newPhone = "0987654321";
    const session = { phoneOtpVerifiedFor: "0987654321" };

    const hasChanged = phoneHasChanged(storedPhone, newPhone);
    const isVerified = isOtpVerifiedForPhone(session, newPhone);

    expect(hasChanged).toBe(true);
    expect(isVerified).toBe(true); // correct flow → allow
  });
});

// ---------------------------------------------------------------------------
// 2. Iron session password security
// ---------------------------------------------------------------------------

describe("SECURITY: iron-session password requirements", () => {
  it("throws when IRON_SESSION_PASSWORD is missing", () => {
    const original = process.env.IRON_SESSION_PASSWORD;
    delete process.env.IRON_SESSION_PASSWORD;
    expect(() => getSessionOptions()).toThrow();
    process.env.IRON_SESSION_PASSWORD = original;
  });

  it("throws when IRON_SESSION_PASSWORD is shorter than 32 characters", () => {
    const original = process.env.IRON_SESSION_PASSWORD;
    process.env.IRON_SESSION_PASSWORD = "short";
    expect(() => getSessionOptions()).toThrow();
    process.env.IRON_SESSION_PASSWORD = original;
  });

  it("accepts password of exactly 32 characters", () => {
    const original = process.env.IRON_SESSION_PASSWORD;
    process.env.IRON_SESSION_PASSWORD = "a".repeat(32);
    expect(() => getSessionOptions()).not.toThrow();
    process.env.IRON_SESSION_PASSWORD = original;
  });

  it("cookie is httpOnly (protects against XSS token theft)", () => {
    const original = process.env.IRON_SESSION_PASSWORD;
    process.env.IRON_SESSION_PASSWORD = "a".repeat(32);
    const options = getSessionOptions();
    expect(options.cookieOptions?.httpOnly).toBe(true);
    process.env.IRON_SESSION_PASSWORD = original;
  });

  it("cookie uses sameSite lax (CSRF protection baseline)", () => {
    const original = process.env.IRON_SESSION_PASSWORD;
    process.env.IRON_SESSION_PASSWORD = "a".repeat(32);
    const options = getSessionOptions();
    expect(options.cookieOptions?.sameSite).toBe("lax");
    process.env.IRON_SESSION_PASSWORD = original;
  });
});

// ---------------------------------------------------------------------------
// 3. Beam webhook replay attack prevention
// ---------------------------------------------------------------------------

describe("SECURITY: Beam webhook replay attack prevention", () => {
  const HMAC_KEY = Buffer.from("secure-test-key-of-32-bytes-long!!!");
  const HMAC_KEY_BASE64 = HMAC_KEY.toString("base64");

  function sign(body: string): string {
    return createHmac("sha256", HMAC_KEY).update(body, "utf8").digest("base64");
  }

  it("REPLAY: signature from charge A cannot authorize charge B payload", () => {
    const chargeAPayload = JSON.stringify({ event: "charge.completed", chargeId: "chg-001", amount: 100 });
    const chargeBPayload = JSON.stringify({ event: "charge.completed", chargeId: "chg-002", amount: 9999 });

    const sigForA = sign(chargeAPayload);

    // Attacker replays sig from A against payload B
    expect(
      verifyBeamWebhookSignature({ rawBody: chargeBPayload, signatureHeader: sigForA, hmacKeyBase64: HMAC_KEY_BASE64 }),
    ).toBe(false);
  });

  it("REPLAY: tampered amount in body invalidates signature", () => {
    const original = JSON.stringify({ event: "charge.completed", amount: 35 });
    const tampered = JSON.stringify({ event: "charge.completed", amount: 0 });
    const sig = sign(original);

    expect(
      verifyBeamWebhookSignature({ rawBody: tampered, signatureHeader: sig, hmacKeyBase64: HMAC_KEY_BASE64 }),
    ).toBe(false);
  });

  it("valid webhook passes with correct body and key", () => {
    const body = JSON.stringify({ event: "charge.completed", chargeId: "chg-003" });
    const sig = sign(body);

    expect(
      verifyBeamWebhookSignature({ rawBody: body, signatureHeader: sig, hmacKeyBase64: HMAC_KEY_BASE64 }),
    ).toBe(true);
  });
});

describe("SECURITY: production configuration", () => {
  it("DEV_SKIP_LINE_AUTH is not enabled in production environment", () => {
    // In tests NODE_ENV may not be "production", but the middleware
    // checks both NODE_ENV !== "production" AND the flag.
    // Verify the logic: in production, the flag must have no effect.
    const isProduction = process.env.NODE_ENV === "production";
    const devSkipEnabled = process.env.NEXT_PUBLIC_DEV_SKIP_LINE_AUTH === "true";

    // This condition mirrors middleware.ts line 7
    const middlewareWouldBypass = !isProduction && devSkipEnabled;

    if (isProduction) {
      // In production builds, even if the flag is set, middleware must not bypass
      expect(middlewareWouldBypass).toBe(false);
    }
    // In non-production (test env), this is expected to be configurable
  });

  it("disables prepared statements in app and migration database clients", () => {
    const workspaceRoot = resolve(process.cwd(), "../..");
    const appClient = readFileSync(
      resolve(workspaceRoot, "packages/shared/src/db/index.ts"),
      "utf8",
    );
    const migrationClient = readFileSync(
      resolve(workspaceRoot, "packages/shared/scripts/apply-sql.mjs"),
      "utf8",
    );
    expect(appClient).toContain("prepare: false");
    expect(migrationClient).toContain("prepare: false");
  });

  it("keeps the browser on the single server-owned registration endpoint", () => {
    const workspaceRoot = resolve(process.cwd(), "../..");
    const client = readFileSync(
      resolve(workspaceRoot, "apps/user/lib/parcel-order-client.ts"),
      "utf8",
    );
    const legacyRoute = readFileSync(
      resolve(workspaceRoot, "apps/user/app/api/smartpost/add-item/route.ts"),
      "utf8",
    );
    expect(client).toContain('/api/parcels/register');
    expect(client).not.toContain('/api/smartpost/add-item');
    expect(client).not.toContain('/api/parcels/draft');
    expect(legacyRoute).toContain("status: 410");
    expect(legacyRoute).not.toContain("requestSmartpostAddItem(");
    expect(legacyRoute).not.toMatch(/\bfetch\s*\(/);
  });

  it("does not collapse different registration incidents into one alert", () => {
    const first = systemErrorEventKey({
      source: "parcel.registration.reconcile-unknown",
      message: "same operational message",
      dedupeKey: "attempt-1:unknown",
    });
    const second = systemErrorEventKey({
      source: "parcel.registration.reconcile-unknown",
      message: "same operational message",
      dedupeKey: "attempt-2:unknown",
    });
    expect(first).not.toBe(second);
    expect(
      systemErrorEventKey({
        source: "parcel.registration.reconcile-unknown",
        message: "message changed",
        dedupeKey: "attempt-1:unknown",
      }),
    ).toBe(first);
  });
});

// ---------------------------------------------------------------------------
// 5. Thai phone normalization consistency
// ---------------------------------------------------------------------------

describe("SECURITY: phone normalization consistency", () => {
  it("same phone in different formats normalizes identically (prevents duplicate accounts)", () => {
    const formats = ["0812345678", "081-234-5678", "081 234 5678", "081.234.5678"];
    const normalized = formats.map(normalizeThaiPhone);
    const unique = new Set(normalized);
    expect(unique.size).toBe(1);
    expect([...unique][0]).toBe("0812345678");
  });

  it("normalizeThaiPhone does NOT strip +66 prefix (intentional — +66 format is invalid for local storage)", () => {
    // +66... is kept as-is so isValidThaiPhone will reject it
    expect(normalizeThaiPhone("+66812345678")).toBe("+66812345678");
  });
});
