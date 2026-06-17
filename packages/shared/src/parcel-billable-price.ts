import {
  getRemoteAreaSurcharge,
  resolveInsuranceFee,
} from "./parcel-price-breakdown";

export type BillablePriceBreakdown = {
  shippingTierBaht: number;
  remoteAreaBaht: number;
  insuranceBaht: number;
  totalBaht: number;
};

export type BillablePriceOrderInput = {
  cusZipcode?: string | null;
  productPrice?: string | null;
  insuranceRatePrice?: string | null;
};

/** Sell tier + remote area + insurance → customer billable total (THB). */
export function computeBillableTotalFromTier(
  shippingTierBaht: number,
  order: BillablePriceOrderInput,
): BillablePriceBreakdown {
  const shipping = Math.max(0, Math.round(shippingTierBaht));
  const remoteAreaBaht = getRemoteAreaSurcharge(order.cusZipcode);
  const insuranceBaht = resolveInsuranceFee(order.productPrice, order.insuranceRatePrice);
  const totalBaht = shipping + remoteAreaBaht + insuranceBaht;
  return {
    shippingTierBaht: shipping,
    remoteAreaBaht,
    insuranceBaht,
    totalBaht,
  };
}

export function formatBillablePriceThb(totalBaht: number): string {
  const n = Number(totalBaht);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`formatBillablePriceThb: invalid total ${totalBaht}`);
  }
  return n.toFixed(2);
}

/** Actual weight in grams from Smartpost / Thailand Post webhook payload. */
export function parseWebhookWeightGrams(item: Record<string, unknown>): number | null {
  const raw =
    item.weight ??
    item.weightGram ??
    item.weight_gram ??
    item.productWeight ??
    item.product_weight ??
    null;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

export function weightKgFromGrams(grams: number): string {
  return (grams / 1000).toFixed(3);
}
