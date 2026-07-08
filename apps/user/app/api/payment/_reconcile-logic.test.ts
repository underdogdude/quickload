/**
 * Tests for payment reconciliation logic — the safety net that prevents money
 * from disappearing when Beam settles a charge after our local expiry or a
 * missed webhook.
 *
 * All tests are pure (no DB / HTTP) and exercise the helper functions and
 * status-gate logic imported from shared packages.
 */
import { describe, it, expect } from "vitest";
import {
  isPaymentReconcileable,
  PAYMENT_RECONCILEABLE_STATUSES,
  mapBeamApiChargeStatusForTest,
} from "@quickload/shared/beam";

// ---------------------------------------------------------------------------
// isPaymentReconcileable
// ---------------------------------------------------------------------------

describe("isPaymentReconcileable", () => {
  it("accepts 'pending' — normal in-flight charge", () => {
    expect(isPaymentReconcileable("pending")).toBe(true);
  });

  it("accepts 'expired' — locally timed-out row that Beam may still have settled", () => {
    expect(isPaymentReconcileable("expired")).toBe(true);
  });

  it("rejects 'succeeded' — already recorded, no action needed", () => {
    expect(isPaymentReconcileable("succeeded")).toBe(false);
  });

  it("rejects 'failed' — terminal, Beam agrees", () => {
    expect(isPaymentReconcileable("failed")).toBe(false);
  });

  it("rejects 'canceled' — terminal, Beam agrees", () => {
    expect(isPaymentReconcileable("canceled")).toBe(false);
  });

  it("rejects unknown strings", () => {
    expect(isPaymentReconcileable("")).toBe(false);
    expect(isPaymentReconcileable("unknown")).toBe(false);
  });

  it("PAYMENT_RECONCILEABLE_STATUSES constant matches function", () => {
    for (const s of PAYMENT_RECONCILEABLE_STATUSES) {
      expect(isPaymentReconcileable(s)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Beam API status mapping — covers the 'expired locally, paid at Beam' case
// ---------------------------------------------------------------------------

describe("Beam API status mapping", () => {
  const map = mapBeamApiChargeStatusForTest;

  it("maps SUCCEEDED to 'succeeded'", () => {
    expect(map("SUCCEEDED")).toBe("succeeded");
    expect(map("SUCCESS")).toBe("succeeded");
    expect(map("succeeded")).toBe("succeeded");
  });

  it("maps PENDING variants to 'pending' (still in-flight, not an error)", () => {
    expect(map("PENDING")).toBe("pending");
    expect(map("PROCESSING")).toBe("pending");
    expect(map("REQUIRES_ACTION")).toBe("pending");
    expect(map("AWAITING_PAYMENT")).toBe("pending");
  });

  it("maps EXPIRED to 'expired'", () => {
    expect(map("EXPIRED")).toBe("expired");
    expect(map("expired")).toBe("expired");
  });

  it("maps FAILED to 'failed'", () => {
    expect(map("FAILED")).toBe("failed");
  });

  it("maps CANCELED / CANCELLED to 'canceled'", () => {
    expect(map("CANCELED")).toBe("canceled");
    expect(map("CANCELLED")).toBe("canceled");
  });

  it("returns 'unknown' for unrecognised strings", () => {
    expect(map("REFUNDED")).toBe("unknown");
    expect(map("")).toBe("unknown");
    expect(map("   ")).toBe("unknown");
  });

  it("is case-insensitive", () => {
    expect(map("succeeded")).toBe("succeeded");
    expect(map("Succeeded")).toBe("succeeded");
    expect(map("SUCCEEDED")).toBe("succeeded");
  });
});

// ---------------------------------------------------------------------------
// Reconcile cron eligibility filter (pure timing logic)
// ---------------------------------------------------------------------------

const PENDING_GRACE_MS = 5 * 60 * 1000;
const LOOKBACK_MS = 24 * 60 * 60 * 1000;

function isEligibleForReconciliation(
  status: string,
  createdAt: Date,
  now: Date,
): boolean {
  const age = now.getTime() - createdAt.getTime();
  if (age > LOOKBACK_MS) return false;
  if (status === "expired") return true;
  if (status === "pending") return age >= PENDING_GRACE_MS;
  return false;
}

describe("reconcile cron eligibility", () => {
  const now = new Date("2026-07-08T06:30:00Z");

  it("skips a pending row younger than 5 min (webhook still expected)", () => {
    const newPending = new Date(now.getTime() - 2 * 60 * 1000); // 2 min ago
    expect(isEligibleForReconciliation("pending", newPending, now)).toBe(false);
  });

  it("includes a pending row older than 5 min (webhook likely missed)", () => {
    const stalePending = new Date(now.getTime() - 10 * 60 * 1000); // 10 min ago
    expect(isEligibleForReconciliation("pending", stalePending, now)).toBe(true);
  });

  it("includes an expired row regardless of age within 24h (rotation-race scenario)", () => {
    // Represents: user authorized SCB Easy → rotated to PromptPay 30 sec later
    const justExpired = new Date(now.getTime() - 90 * 1000); // 90 sec ago
    expect(isEligibleForReconciliation("expired", justExpired, now)).toBe(true);
  });

  it("excludes rows older than 24h (Beam API may not retain them)", () => {
    const ancient = new Date(now.getTime() - 25 * 60 * 60 * 1000);
    expect(isEligibleForReconciliation("pending", ancient, now)).toBe(false);
    expect(isEligibleForReconciliation("expired", ancient, now)).toBe(false);
  });

  it("excludes succeeded rows (not reconcileable)", () => {
    const recent = new Date(now.getTime() - 30 * 60 * 1000);
    expect(isEligibleForReconciliation("succeeded", recent, now)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Production incident replay — rotation-race scenario
// ---------------------------------------------------------------------------

describe("rotation-race scenario (production incident replay)", () => {
  /**
   * Timeline:
   *   T+0s   Customer opens pay page → SCB Easy charge created (providerChargeId=A)
   *   T+20s  Customer opens pay page again → rotation step fires:
   *            - row A expired in DB
   *            - PromptPay row B created
   *   T+30s  Bank processes SCB Easy → Beam settles charge A
   *   T+35s  Beam webhook arrives for A → original code: status=expired, missed
   *   T+15m  Reconcile cron runs → picks up row A (expired, <24h) → settles it
   */

  it("expired row IS eligible for reconciliation (cron catches the missed webhook)", () => {
    const now = new Date("2026-07-08T06:42:00Z");
    // Row A was created at 12:57 Bangkok (05:57 UTC), expired at T+20s
    const rowACreatedAt = new Date("2026-07-08T05:57:09Z");
    expect(isEligibleForReconciliation("expired", rowACreatedAt, now)).toBe(true);
  });

  it("isPaymentReconcileable gates markPaymentSucceeded correctly", () => {
    // The row Beam needs to settle is 'expired' — must be accepted
    expect(isPaymentReconcileable("expired")).toBe(true);
    // A 'succeeded' row must never be re-settled (idempotency guard)
    expect(isPaymentReconcileable("succeeded")).toBe(false);
  });

  it("Beam SUCCEEDED status is correctly mapped (triggers settlement path)", () => {
    const map = mapBeamApiChargeStatusForTest;
    // Beam may return either casing from their API
    expect(map("SUCCEEDED")).toBe("succeeded");
    expect(map("SUCCESS")).toBe("succeeded");
  });
});
