/**
 * Late-payment penalty schedule. The clock starts at parcels.penalty_clock_started_at
 * (set by the future Smartpost shipped-webhook). Lateness Δ = now - penalty_clock_started_at.
 * Penalty is +multiplier * basePrice (NOT compounded across tiers).
 */
export const PENALTY_TIERS = [
  { startMinutes: 0, multiplier: 0.0 },
  { startMinutes: 30, multiplier: 0.5 },
  { startMinutes: 240, multiplier: 1.0 },
  { startMinutes: 960, multiplier: 2.0 },
] as const;

export type PenaltyTier = (typeof PENALTY_TIERS)[number];

/** If amount_paid is still 0 this many minutes after clock start, parcel is auto-canceled. */
export const ABANDON_AFTER_MINUTES = 24 * 60;

export type OutstandingState =
  | "clock_not_started"
  | "active"
  | "frozen"
  | "abandoned"
  | "settled";

export type Outstanding = {
  state: OutstandingState;
  /** Base + penalty, in major THB (number, not string). */
  totalOwed: number;
  /** max(0, totalOwed - amountPaid). */
  outstanding: number;
  /** The currently-applicable tier; null if clock not started. */
  currentTier: PenaltyTier | null;
  /** The next tier above the current; null if at top tier or frozen. */
  nextTier: PenaltyTier | null;
  /** Wall-clock when the next jump happens; null if frozen / clock not started / at top. */
  nextTierAt: Date | null;
  /** Wall-clock when auto-cancel triggers; null if frozen / clock not started. */
  abandonAt: Date | null;
  /** True if a partial payment has frozen the bill. */
  frozen: boolean;
};
