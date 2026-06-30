import { describe, it, expect } from "vitest";
import { phoneHasChanged, isOtpVerifiedForPhone } from "./_patch-profile-logic";

// ---------------------------------------------------------------------------
// phoneHasChanged
// ---------------------------------------------------------------------------

describe("phoneHasChanged", () => {
  it("returns false when phone is identical", () => {
    expect(phoneHasChanged("0812345678", "0812345678")).toBe(false);
  });

  it("returns false when phone is identical after normalization (strips hyphens)", () => {
    expect(phoneHasChanged("0812345678", "081-234-5678")).toBe(false);
  });

  it("returns false when phone is identical after normalization (strips spaces)", () => {
    expect(phoneHasChanged("0812345678", "081 234 5678")).toBe(false);
  });

  it("returns true when phone actually changes", () => {
    expect(phoneHasChanged("0812345678", "0987654321")).toBe(true);
  });

  it("returns true when stored phone is null (first-time registration)", () => {
    expect(phoneHasChanged(null, "0812345678")).toBe(true);
  });

  it("returns true when stored phone is undefined", () => {
    expect(phoneHasChanged(undefined, "0812345678")).toBe(true);
  });

  it("returns true when stored phone is empty string", () => {
    expect(phoneHasChanged("", "0812345678")).toBe(true);
  });

  it("returns false when both phones normalize to same value", () => {
    // Leading/trailing whitespace stripped by normalizeThaiPhone
    expect(phoneHasChanged("  0812345678  ", "0812345678")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isOtpVerifiedForPhone (CRITICAL SECURITY CHECK)
// ---------------------------------------------------------------------------

describe("isOtpVerifiedForPhone", () => {
  it("returns true when session verifiedFor matches the new phone exactly", () => {
    expect(isOtpVerifiedForPhone({ phoneOtpVerifiedFor: "0812345678" }, "0812345678")).toBe(true);
  });

  it("returns true when session verifiedFor matches after normalization", () => {
    // New phone comes in with hyphens, session stored normalized
    expect(isOtpVerifiedForPhone({ phoneOtpVerifiedFor: "0812345678" }, "081-234-5678")).toBe(true);
  });

  it("returns false when session verifiedFor is a different phone", () => {
    expect(isOtpVerifiedForPhone({ phoneOtpVerifiedFor: "0987654321" }, "0812345678")).toBe(false);
  });

  it("returns false when session verifiedFor is undefined (OTP never completed)", () => {
    expect(isOtpVerifiedForPhone({}, "0812345678")).toBe(false);
  });

  it("returns false when session verifiedFor is empty string", () => {
    expect(isOtpVerifiedForPhone({ phoneOtpVerifiedFor: "" }, "0812345678")).toBe(false);
  });

  it("SECURITY: does not allow a different normalized phone to bypass", () => {
    // Attacker tries submitting phone that normalizes to a different number
    expect(isOtpVerifiedForPhone({ phoneOtpVerifiedFor: "0812345678" }, "0987654321")).toBe(false);
  });

  it("SECURITY: returns false when verifiedFor is undefined even if phone is blank", () => {
    // Edge: both undefined/blank should NOT grant access
    expect(isOtpVerifiedForPhone({ phoneOtpVerifiedFor: undefined }, "")).toBe(false);
  });
});
