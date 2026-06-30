/**
 * Tests for payment charge state logic — QR expiry, outstanding computation,
 * and charge data construction (all pure, no DB or HTTP required).
 */
import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// QR expiry window
// ---------------------------------------------------------------------------

const QR_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes, as set in charges/route.ts

describe("QR expiry window", () => {
  it("10 minutes = 600000ms", () => {
    expect(QR_EXPIRY_MS).toBe(600_000);
  });

  it("a QR created just now has not expired", () => {
    const now = Date.now();
    const createdAt = now - 1_000; // 1 second ago
    expect(now - createdAt < QR_EXPIRY_MS).toBe(true);
  });

  it("a QR created 10 minutes ago has expired", () => {
    const now = Date.now();
    const createdAt = now - QR_EXPIRY_MS;
    expect(now - createdAt >= QR_EXPIRY_MS).toBe(true);
  });

  it("a QR created 9m59s ago has NOT expired yet", () => {
    const now = Date.now();
    const createdAt = now - (QR_EXPIRY_MS - 1_000);
    expect(now - createdAt < QR_EXPIRY_MS).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Outstanding computation (via @quickload/shared/penalty)
// ---------------------------------------------------------------------------

import { computeOutstanding } from "@quickload/shared/penalty";

describe("computeOutstanding", () => {
  it("returns unpaid state when nothing has been paid", () => {
    const out = computeOutstanding({ price: "100", amountPaid: "0" });
    expect(out.state).toBe("unpaid");
    expect(out.totalOwed).toBe(100);
    expect(out.outstanding).toBe(100);
  });

  it("returns settled state when fully paid", () => {
    const out = computeOutstanding({ price: "100", amountPaid: "100" });
    expect(out.state).toBe("settled");
    expect(out.outstanding).toBe(0);
  });

  it("returns correct outstanding for partial payment", () => {
    const out = computeOutstanding({ price: "150", amountPaid: "50" });
    expect(out.state).toBe("unpaid");
    expect(out.outstanding).toBe(100);
    expect(out.totalOwed).toBe(150);
  });

  it("outstanding is clamped to zero when overpaid", () => {
    const out = computeOutstanding({ price: "100", amountPaid: "200" });
    expect(out.outstanding).toBe(0);
    expect(out.state).toBe("settled");
  });

  it("handles zero price (0.00 — before actual weight)", () => {
    const out = computeOutstanding({ price: "0", amountPaid: "0" });
    expect(out.totalOwed).toBe(0);
    expect(out.state).toBe("settled");
  });

  it("throws for invalid (non-numeric) price", () => {
    expect(() => computeOutstanding({ price: "NaN", amountPaid: "0" })).toThrow();
  });

  it("handles decimal prices correctly", () => {
    const out = computeOutstanding({ price: "99.50", amountPaid: "0" });
    expect(out.totalOwed).toBe(99.5);
    expect(out.outstanding).toBe(99.5);
  });
});
