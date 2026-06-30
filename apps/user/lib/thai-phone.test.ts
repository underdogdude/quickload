import { describe, it, expect } from "vitest";
import { normalizeThaiPhone, isValidThaiPhone } from "./thai-phone";

describe("normalizeThaiPhone", () => {
  it("trims whitespace", () => {
    expect(normalizeThaiPhone("  0812345678  ")).toBe("0812345678");
  });

  it("removes hyphens", () => {
    expect(normalizeThaiPhone("081-234-5678")).toBe("0812345678");
  });

  it("removes spaces between digits", () => {
    expect(normalizeThaiPhone("081 234 5678")).toBe("0812345678");
  });

  it("removes dots", () => {
    expect(normalizeThaiPhone("081.234.5678")).toBe("0812345678");
  });

  it("removes parentheses", () => {
    expect(normalizeThaiPhone("(081)2345678")).toBe("0812345678");
  });

  it("does not strip + prefix (country code preserved)", () => {
    expect(normalizeThaiPhone("+66812345678")).toBe("+66812345678");
  });

  it("does not modify plain 10-digit number", () => {
    expect(normalizeThaiPhone("0812345678")).toBe("0812345678");
  });
});

describe("isValidThaiPhone", () => {
  describe("valid mobile numbers", () => {
    it("accepts 08x format (10 digits)", () => {
      expect(isValidThaiPhone("0812345678")).toBe(true);
    });

    it("accepts 09x format", () => {
      expect(isValidThaiPhone("0987654321")).toBe(true);
    });

    it("accepts 06x format", () => {
      expect(isValidThaiPhone("0661234567")).toBe(true);
    });

    it("accepts 05x format", () => {
      expect(isValidThaiPhone("0512345678")).toBe(true);
    });

    it("accepts number with hyphens (normalizes first)", () => {
      expect(isValidThaiPhone("081-234-5678")).toBe(true);
    });

    it("accepts number with spaces", () => {
      expect(isValidThaiPhone("081 234 5678")).toBe(true);
    });
  });

  describe("valid Bangkok/geographic numbers", () => {
    it("accepts Bangkok 02 + 8 digits", () => {
      expect(isValidThaiPhone("021234567")).toBe(true);
    });
  });

  describe("invalid numbers", () => {
    it("rejects +66 international prefix", () => {
      expect(isValidThaiPhone("+66812345678")).toBe(false);
    });

    it("rejects 66... without + (not local format)", () => {
      expect(isValidThaiPhone("66812345678")).toBe(false);
    });

    it("rejects empty string", () => {
      expect(isValidThaiPhone("")).toBe(false);
    });

    it("rejects non-numeric string", () => {
      expect(isValidThaiPhone("abcdefghij")).toBe(false);
    });

    it("rejects number starting with 01 (invalid prefix)", () => {
      expect(isValidThaiPhone("0112345678")).toBe(false);
    });

    it("rejects 9-digit mobile (too short)", () => {
      expect(isValidThaiPhone("081234567")).toBe(false);
    });

    it("rejects 11-digit mobile (too long)", () => {
      expect(isValidThaiPhone("08123456789")).toBe(false);
    });
  });
});
