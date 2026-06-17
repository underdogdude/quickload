import { asc, gte } from "drizzle-orm";
import { getDb, pricingTiers } from "./db";

export const MAX_PRICING_WEIGHT_GRAMS = 30_000;

export type PricingDb = ReturnType<typeof getDb>;

export type SellTierMatch = {
  priceThb: number;
  weightUpToGrams: number;
};

/** Smallest tier with weight_up_to_grams >= actual weight (same as /api/pricing/estimate). */
export async function lookupSellPriceThbForWeight(
  executor: PricingDb,
  weightGrams: number,
): Promise<SellTierMatch | null> {
  const grams = Math.floor(weightGrams);
  if (!Number.isFinite(grams) || grams <= 0) return null;
  if (grams > MAX_PRICING_WEIGHT_GRAMS) return null;

  const rows = await executor
    .select({
      priceThb: pricingTiers.priceThb,
      weightUpToGrams: pricingTiers.weightUpToGrams,
    })
    .from(pricingTiers)
    .where(gte(pricingTiers.weightUpToGrams, grams))
    .orderBy(asc(pricingTiers.weightUpToGrams))
    .limit(1);

  const tier = rows[0];
  if (!tier) return null;
  return {
    priceThb: tier.priceThb,
    weightUpToGrams: tier.weightUpToGrams,
  };
}
