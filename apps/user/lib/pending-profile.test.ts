// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  savePendingProfile,
  readPendingProfile,
  clearPendingProfile,
  markPhoneOtpVerified,
  readPhoneOtpVerified,
  clearPhoneOtpVerified,
  maskThaiPhone,
  type PendingProfile,
} from "./pending-profile";

const SAMPLE_PROFILE: PendingProfile = {
  firstName: "สมชาย",
  lastName: "ใจดี",
  phone: "0812345678",
  email: "test@example.com",
  birthDate: "1990-01-01",
};

beforeEach(() => {
  sessionStorage.clear();
});

// ---------------------------------------------------------------------------
// savePendingProfile / readPendingProfile / clearPendingProfile
// ---------------------------------------------------------------------------

describe("savePendingProfile / readPendingProfile", () => {
  it("round-trips a profile through sessionStorage", () => {
    savePendingProfile(SAMPLE_PROFILE);
    const result = readPendingProfile();
    expect(result).toEqual(SAMPLE_PROFILE);
  });

  it("returns null when nothing saved", () => {
    expect(readPendingProfile()).toBeNull();
  });

  it("returns null when sessionStorage contains invalid JSON", () => {
    sessionStorage.setItem("quickload_pending_profile", "invalid-json{{{");
    expect(readPendingProfile()).toBeNull();
  });

  it("overwrites previous saved profile on second save", () => {
    savePendingProfile(SAMPLE_PROFILE);
    const updated: PendingProfile = { ...SAMPLE_PROFILE, firstName: "สมหญิง" };
    savePendingProfile(updated);
    expect(readPendingProfile()?.firstName).toBe("สมหญิง");
  });
});

describe("clearPendingProfile", () => {
  it("removes saved profile", () => {
    savePendingProfile(SAMPLE_PROFILE);
    clearPendingProfile();
    expect(readPendingProfile()).toBeNull();
  });

  it("does not throw when called with nothing saved", () => {
    expect(() => clearPendingProfile()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// markPhoneOtpVerified / readPhoneOtpVerified / clearPhoneOtpVerified
// ---------------------------------------------------------------------------

describe("markPhoneOtpVerified / readPhoneOtpVerified", () => {
  it("stores and reads back the verified phone", () => {
    markPhoneOtpVerified("0812345678");
    expect(readPhoneOtpVerified()).toBe("0812345678");
  });

  it("returns null when nothing stored", () => {
    expect(readPhoneOtpVerified()).toBeNull();
  });

  it("overwrites previous verified phone", () => {
    markPhoneOtpVerified("0812345678");
    markPhoneOtpVerified("0987654321");
    expect(readPhoneOtpVerified()).toBe("0987654321");
  });
});

describe("clearPhoneOtpVerified", () => {
  it("removes verified phone", () => {
    markPhoneOtpVerified("0812345678");
    clearPhoneOtpVerified();
    expect(readPhoneOtpVerified()).toBeNull();
  });

  it("does not throw when called with nothing stored", () => {
    expect(() => clearPhoneOtpVerified()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// maskThaiPhone — pure function
// ---------------------------------------------------------------------------

describe("maskThaiPhone", () => {
  it("masks a standard 10-digit local number", () => {
    expect(maskThaiPhone("0812345678")).toBe("081-xxx-5678");
  });

  it("masks a number already in 66 format", () => {
    // 66812345678 → local is 0812345678 (10 digits) → 081-xxx-5678
    expect(maskThaiPhone("66812345678")).toBe("081-xxx-5678");
  });

  it("returns original phone when too short (< 6 digits)", () => {
    expect(maskThaiPhone("01234")).toBe("01234");
  });

  it("masks a non-10-digit number using 2-char prefix pattern", () => {
    // 9-digit number: 021234567 → local is 021234567 (9 digits)
    // formula: local.slice(0,2) + -xxx- + local.slice(-4) → 02-xxx-4567
    expect(maskThaiPhone("021234567")).toBe("02-xxx-4567");
  });

  it("strips non-digit characters before masking", () => {
    expect(maskThaiPhone("081-234-5678")).toBe("081-xxx-5678");
  });

  it("handles different mobile prefixes correctly", () => {
    expect(maskThaiPhone("0987654321")).toBe("098-xxx-4321");
    expect(maskThaiPhone("0661234567")).toBe("066-xxx-4567");
  });
});
