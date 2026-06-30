import { describe, it, expect } from "vitest";
import {
  getOtpResendCooldownSec,
  isAlreadyVerifiedFor,
  hasPendingTokenForPhone,
} from "./_otp-session-logic";

const PHONE = "0812345678";
const OTHER_PHONE = "0987654321";
const NOW = 1_700_000_000_000; // fixed epoch ms

// ---------------------------------------------------------------------------
// getOtpResendCooldownSec
// ---------------------------------------------------------------------------

describe("getOtpResendCooldownSec", () => {
  it("returns null when session has no OTP data (no previous request)", () => {
    expect(getOtpResendCooldownSec({}, PHONE, NOW)).toBeNull();
  });

  it("returns null when the phone differs from the session phone", () => {
    const session = { phoneOtpPhone: OTHER_PHONE, phoneOtpRequestedAt: NOW - 10_000 };
    expect(getOtpResendCooldownSec(session, PHONE, NOW)).toBeNull();
  });

  it("returns null when cooldown has exactly expired (60s ago)", () => {
    const session = { phoneOtpPhone: PHONE, phoneOtpRequestedAt: NOW - 60_000 };
    expect(getOtpResendCooldownSec(session, PHONE, NOW)).toBeNull();
  });

  it("returns null when cooldown expired more than 60s ago", () => {
    const session = { phoneOtpPhone: PHONE, phoneOtpRequestedAt: NOW - 90_000 };
    expect(getOtpResendCooldownSec(session, PHONE, NOW)).toBeNull();
  });

  it("returns positive seconds when within cooldown window", () => {
    const session = { phoneOtpPhone: PHONE, phoneOtpRequestedAt: NOW - 10_000 };
    const result = getOtpResendCooldownSec(session, PHONE, NOW);
    expect(result).not.toBeNull();
    expect(result).toBe(50); // 60 - 10 = 50s remaining
  });

  it("returns 60 when OTP was just requested (1ms ago)", () => {
    const session = { phoneOtpPhone: PHONE, phoneOtpRequestedAt: NOW - 1 };
    const waitSec = getOtpResendCooldownSec(session, PHONE, NOW);
    expect(waitSec).toBe(60); // ceil((60000 - 1) / 1000) = 60
  });

  it("returns 1 when exactly 1ms of cooldown remains", () => {
    const session = { phoneOtpPhone: PHONE, phoneOtpRequestedAt: NOW - 59_999 };
    expect(getOtpResendCooldownSec(session, PHONE, NOW)).toBe(1);
  });

  it("uses Math.ceil (partial seconds count as a full second)", () => {
    const session = { phoneOtpPhone: PHONE, phoneOtpRequestedAt: NOW - 30_001 };
    // remaining = 60000 - 30001 = 29999ms → ceil(29999/1000) = 30
    expect(getOtpResendCooldownSec(session, PHONE, NOW)).toBe(30);
  });

  it("returns null when phoneOtpRequestedAt is undefined", () => {
    const session = { phoneOtpPhone: PHONE };
    expect(getOtpResendCooldownSec(session, PHONE, NOW)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isAlreadyVerifiedFor
// ---------------------------------------------------------------------------

describe("isAlreadyVerifiedFor", () => {
  it("returns true when no token exists and phone is already verified", () => {
    const session = { phoneOtpVerifiedFor: PHONE };
    expect(isAlreadyVerifiedFor(session, PHONE)).toBe(true);
  });

  it("returns false when a token exists (not yet consumed)", () => {
    const session = { phoneOtpToken: "tok-abc", phoneOtpVerifiedFor: PHONE };
    expect(isAlreadyVerifiedFor(session, PHONE)).toBe(false);
  });

  it("returns false when verified phone is different", () => {
    const session = { phoneOtpVerifiedFor: OTHER_PHONE };
    expect(isAlreadyVerifiedFor(session, PHONE)).toBe(false);
  });

  it("returns false when session is empty", () => {
    expect(isAlreadyVerifiedFor({}, PHONE)).toBe(false);
  });

  it("returns false when verifiedFor is undefined", () => {
    expect(isAlreadyVerifiedFor({ phoneOtpVerifiedFor: undefined }, PHONE)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hasPendingTokenForPhone
// ---------------------------------------------------------------------------

describe("hasPendingTokenForPhone", () => {
  it("returns true when token exists and phone matches", () => {
    const session = { phoneOtpToken: "tok-abc", phoneOtpPhone: PHONE };
    expect(hasPendingTokenForPhone(session, PHONE)).toBe(true);
  });

  it("returns false when token exists but phone is different", () => {
    const session = { phoneOtpToken: "tok-abc", phoneOtpPhone: OTHER_PHONE };
    expect(hasPendingTokenForPhone(session, PHONE)).toBe(false);
  });

  it("returns false when no token", () => {
    const session = { phoneOtpPhone: PHONE };
    expect(hasPendingTokenForPhone(session, PHONE)).toBe(false);
  });

  it("returns false when session is empty", () => {
    expect(hasPendingTokenForPhone({}, PHONE)).toBe(false);
  });

  it("returns false when token is empty string", () => {
    const session = { phoneOtpToken: "", phoneOtpPhone: PHONE };
    expect(hasPendingTokenForPhone(session, PHONE)).toBe(false);
  });
});
