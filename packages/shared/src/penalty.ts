/**
 * Outstanding balance = parcel price minus succeeded payments (amount_paid).
 * No late-payment tiers or auto-abandonment.
 */
export type OutstandingState = "settled" | "unpaid";

export type Outstanding = {
  state: OutstandingState;
  /** Base price in major THB (number, not string). */
  totalOwed: number;
  /** max(0, totalOwed - amountPaid). */
  outstanding: number;
};

export function computeOutstanding(args: {
  /** parcels.price as numeric string, e.g. "100.00". */
  price: string;
  /** parcels.amount_paid as numeric string, e.g. "0.00" or "100.00". */
  amountPaid: string;
}): Outstanding {
  const totalOwed = Number(args.price);
  const paid = Number(args.amountPaid);
  if (!Number.isFinite(totalOwed) || totalOwed < 0) {
    throw new Error(`computeOutstanding: invalid price ${args.price}`);
  }
  const outstanding = Math.max(0, totalOwed - paid);
  return {
    state: outstanding === 0 ? "settled" : "unpaid",
    totalOwed,
    outstanding,
  };
}
