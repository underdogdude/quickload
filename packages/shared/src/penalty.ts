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

/**
 * Pure derivation of penalty + outstanding state. Same inputs always produce
 * the same output. No DB access. Callers should pass freshly-read values.
 */
export function computeOutstanding(args: {
  /** parcels.price as numeric string, e.g. "100.00". */
  price: string;
  /** parcels.penalty_clock_started_at; null => clock has not started. */
  penaltyClockStartedAt: Date | null;
  /** parcels.amount_paid as numeric string, e.g. "0.00" or "100.00". */
  amountPaid: string;
  /** MIN(payments.paid_at WHERE status='succeeded' AND parcel_id=parcels.id); null if no payment yet. */
  firstSuccessfulPaymentAt: Date | null;
  now: Date;
}): Outstanding {
  const basePrice = Number(args.price);
  const paid = Number(args.amountPaid);
  if (!Number.isFinite(basePrice) || basePrice < 0) {
    throw new Error(`computeOutstanding: invalid price ${args.price}`);
  }

  const tierForMinutes = (deltaMin: number): PenaltyTier => {
    let chosen: PenaltyTier = PENALTY_TIERS[0];
    for (const t of PENALTY_TIERS) {
      if (deltaMin >= t.startMinutes) chosen = t;
      else break;
    }
    return chosen;
  };

  const tierAfter = (tier: PenaltyTier): PenaltyTier | null => {
    const idx = PENALTY_TIERS.indexOf(tier);
    if (idx < 0) return null;
    return PENALTY_TIERS[idx + 1] ?? null;
  };

  // 1. Clock not started: no penalty applies.
  if (!args.penaltyClockStartedAt) {
    const totalOwed = basePrice;
    const outstanding = Math.max(0, totalOwed - paid);
    return {
      state: outstanding === 0 ? "settled" : "clock_not_started",
      totalOwed,
      outstanding,
      currentTier: null,
      nextTier: null,
      nextTierAt: null,
      abandonAt: null,
      frozen: false,
    };
  }

  const clockStart = args.penaltyClockStartedAt;
  const abandonAt = new Date(clockStart.getTime() + ABANDON_AFTER_MINUTES * 60_000);

  // 2. Frozen: any successful payment freezes the bill at the tier in effect at that moment.
  if (paid > 0 && args.firstSuccessfulPaymentAt) {
    const frozenDeltaMin = Math.max(
      0,
      (args.firstSuccessfulPaymentAt.getTime() - clockStart.getTime()) / 60_000,
    );
    const frozenTier = tierForMinutes(frozenDeltaMin);
    const totalOwed = basePrice * (1 + frozenTier.multiplier);
    const outstanding = Math.max(0, totalOwed - paid);
    return {
      state: outstanding === 0 ? "settled" : "frozen",
      totalOwed,
      outstanding,
      currentTier: frozenTier,
      nextTier: null,
      nextTierAt: null,
      abandonAt: null,
      frozen: true,
    };
  }

  // 3. Abandoned: 24h elapsed and no payment.
  const nowMs = args.now.getTime();
  const deltaMin = (nowMs - clockStart.getTime()) / 60_000;
  if (deltaMin >= ABANDON_AFTER_MINUTES && paid === 0) {
    // Use the top tier in effect at abandonment cutoff for display purposes.
    const finalTier = tierForMinutes(ABANDON_AFTER_MINUTES);
    const totalOwed = basePrice * (1 + finalTier.multiplier);
    return {
      state: "abandoned",
      totalOwed,
      outstanding: totalOwed, // not relevant once canceled, but consistent
      currentTier: finalTier,
      nextTier: null,
      nextTierAt: null,
      abandonAt,
      frozen: false,
    };
  }

  // 4. Active: pick current tier from elapsed minutes.
  const currentTier = tierForMinutes(deltaMin);
  const nextTier = tierAfter(currentTier);
  const totalOwed = basePrice * (1 + currentTier.multiplier);
  const outstanding = Math.max(0, totalOwed - paid);
  const nextTierAt = nextTier
    ? new Date(clockStart.getTime() + nextTier.startMinutes * 60_000)
    : null;
  return {
    state: outstanding === 0 ? "settled" : "active",
    totalOwed,
    outstanding,
    currentTier,
    nextTier,
    nextTierAt,
    abandonAt,
    frozen: false,
  };
}
