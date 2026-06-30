/**
 * Tests for Beam webhook HMAC signature verification.
 *
 * The verifyBeamWebhookSignature function lives in @quickload/shared/beam
 * and is the security gate for the payment webhook handler.
 */
import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyBeamWebhookSignature } from "@quickload/shared/beam";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HMAC_KEY_BYTES = Buffer.from("test-webhook-secret-key-32-bytes!!!");
const HMAC_KEY_BASE64 = HMAC_KEY_BYTES.toString("base64");

function sign(body: string): string {
  return createHmac("sha256", HMAC_KEY_BYTES).update(body, "utf8").digest("base64");
}

// ---------------------------------------------------------------------------
// verifyBeamWebhookSignature
// ---------------------------------------------------------------------------

describe("verifyBeamWebhookSignature", () => {
  it("returns true for a valid signature", () => {
    const body = JSON.stringify({ event: "charge.completed", id: "chg-001" });
    const sig = sign(body);
    expect(verifyBeamWebhookSignature({ rawBody: body, signatureHeader: sig, hmacKeyBase64: HMAC_KEY_BASE64 })).toBe(true);
  });

  it("returns false when signature is wrong", () => {
    const body = JSON.stringify({ event: "charge.completed" });
    expect(
      verifyBeamWebhookSignature({ rawBody: body, signatureHeader: "wrong-sig", hmacKeyBase64: HMAC_KEY_BASE64 }),
    ).toBe(false);
  });

  it("returns false when signature is null", () => {
    const body = "{}";
    expect(
      verifyBeamWebhookSignature({ rawBody: body, signatureHeader: null, hmacKeyBase64: HMAC_KEY_BASE64 }),
    ).toBe(false);
  });

  it("returns false when signature is undefined", () => {
    const body = "{}";
    expect(
      verifyBeamWebhookSignature({ rawBody: body, signatureHeader: undefined, hmacKeyBase64: HMAC_KEY_BASE64 }),
    ).toBe(false);
  });

  it("returns false when HMAC key is empty (not configured)", () => {
    const body = "{}";
    const sig = sign(body);
    expect(
      verifyBeamWebhookSignature({ rawBody: body, signatureHeader: sig, hmacKeyBase64: "" }),
    ).toBe(false);
  });

  it("returns false when body was tampered after signing", () => {
    const original = JSON.stringify({ amount: 100 });
    const tampered = JSON.stringify({ amount: 9999 });
    const sig = sign(original);
    expect(
      verifyBeamWebhookSignature({ rawBody: tampered, signatureHeader: sig, hmacKeyBase64: HMAC_KEY_BASE64 }),
    ).toBe(false);
  });

  it("returns false when HMAC key is wrong", () => {
    const body = JSON.stringify({ event: "charge.completed" });
    const sig = sign(body);
    const wrongKeyBase64 = Buffer.from("completely-different-key-abcdef!").toString("base64");
    expect(
      verifyBeamWebhookSignature({ rawBody: body, signatureHeader: sig, hmacKeyBase64: wrongKeyBase64 }),
    ).toBe(false);
  });

  it("is idempotent — same inputs always produce same result", () => {
    const body = JSON.stringify({ event: "charge.completed", id: "chg-xyz" });
    const sig = sign(body);
    const result1 = verifyBeamWebhookSignature({ rawBody: body, signatureHeader: sig, hmacKeyBase64: HMAC_KEY_BASE64 });
    const result2 = verifyBeamWebhookSignature({ rawBody: body, signatureHeader: sig, hmacKeyBase64: HMAC_KEY_BASE64 });
    expect(result1).toBe(true);
    expect(result2).toBe(true);
  });

  it("is sensitive to whitespace differences in body", () => {
    const compact = JSON.stringify({ event: "charge.completed" });
    const pretty = JSON.stringify({ event: "charge.completed" }, null, 2);
    const sig = sign(compact);
    expect(
      verifyBeamWebhookSignature({ rawBody: pretty, signatureHeader: sig, hmacKeyBase64: HMAC_KEY_BASE64 }),
    ).toBe(false);
  });

  it("SECURITY: replay attack — signature is body-specific and cannot be reused for a different body", () => {
    const body1 = JSON.stringify({ event: "charge.completed", id: "chg-001" });
    const body2 = JSON.stringify({ event: "charge.completed", id: "chg-002" });
    const sig1 = sign(body1);
    expect(
      verifyBeamWebhookSignature({ rawBody: body2, signatureHeader: sig1, hmacKeyBase64: HMAC_KEY_BASE64 }),
    ).toBe(false);
  });
});
