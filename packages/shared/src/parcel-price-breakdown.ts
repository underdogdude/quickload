/** Remote-area recipient zipcodes — 20 THB surcharge (same list as /send/review). */
export const REMOTE_AREA_ZIPCODES = new Set([
  "20120",
  "23170",
  "81150",
  "81210",
  "82160",
  "83000",
  "83100",
  "83110",
  "83120",
  "83130",
  "83150",
  "84140",
  "84280",
  "84310",
  "84320",
  "84330",
  "84360",
  "57170",
  "57180",
  "57260",
  "58000",
  "58110",
  "58120",
  "58130",
  "58140",
  "58150",
  "63150",
  "63170",
  "71180",
  "71240",
  "94000",
  "94110",
  "94120",
  "94130",
  "94140",
  "94150",
  "94160",
  "94170",
  "94180",
  "94190",
  "94220",
  "94230",
  "95000",
  "95110",
  "95120",
  "95130",
  "95140",
  "95150",
  "95160",
  "95170",
  "96000",
  "96110",
  "96120",
  "96130",
  "96140",
  "96150",
  "96160",
  "96170",
  "96180",
  "96190",
  "96210",
  "96220",
  "83001",
  "94001",
  "95001",
  "50250",
  "50310",
  "50350",
  "55130",
  "55220",
  "57310",
  "57340",
  "83111",
]);

export const REMOTE_AREA_SURCHARGE_BAHT = 20;

export function calculateInsuranceFee(productPrice: number): number {
  if (productPrice <= 2000) return 0;
  return Math.ceil(productPrice / 5000) * 10 + 25;
}

export function getRemoteAreaSurcharge(zipcode: string | null | undefined): number {
  const zip = zipcode?.trim();
  if (!zip) return 0;
  return REMOTE_AREA_ZIPCODES.has(zip) ? REMOTE_AREA_SURCHARGE_BAHT : 0;
}

export function resolveInsuranceFee(
  productPrice: string | null | undefined,
  insuranceRatePrice: string | null | undefined,
): number {
  const declared = Number(productPrice ?? 0);
  const insuranceFlag = Number(insuranceRatePrice ?? 0);
  if (!Number.isFinite(declared) && !Number.isFinite(insuranceFlag)) return 0;
  if (insuranceFlag <= 0 && declared <= 2000) return 0;
  const value = declared > 0 ? declared : insuranceFlag;
  return calculateInsuranceFee(Number.isFinite(value) ? value : 0);
}

export type ParcelPriceBreakdownInput = {
  parcelPrice: string | null | undefined;
  thaiPostPriceConfirmedAt: string | null | undefined;
  status: string;
  cusZipcode: string | null | undefined;
  productPrice: string | null | undefined;
  insuranceRatePrice: string | null | undefined;
  /** Base shipping from /api/pricing/estimate when final price is not confirmed yet. */
  estimatedBasePrice?: number | null;
};

export type ParcelPriceBreakdown = {
  isPriceConfirmed: boolean;
  showPendingBadge: boolean;
  shippingFee: number | null;
  insuranceFee: number;
  remoteAreaFee: number;
  total: number | null;
  shippingIsEstimate: boolean;
};

export function isParcelPriceConfirmed(thaiPostPriceConfirmedAt: string | null | undefined): boolean {
  return thaiPostPriceConfirmedAt != null;
}

export function computeParcelPriceBreakdown(input: ParcelPriceBreakdownInput): ParcelPriceBreakdown {
  const isPriceConfirmed = isParcelPriceConfirmed(input.thaiPostPriceConfirmedAt);
  const showPendingBadge =
    input.status === "awaiting_actual_weight" || !isPriceConfirmed;

  const insuranceFee = resolveInsuranceFee(input.productPrice, input.insuranceRatePrice);
  const remoteAreaFee = getRemoteAreaSurcharge(input.cusZipcode);

  const parcelPriceNum = input.parcelPrice != null ? Number(input.parcelPrice) : NaN;
  const hasParcelPrice = Number.isFinite(parcelPriceNum) && parcelPriceNum > 0;
  const estimatedBase =
    input.estimatedBasePrice != null && Number.isFinite(input.estimatedBasePrice) && input.estimatedBasePrice > 0
      ? input.estimatedBasePrice
      : null;

  if (isPriceConfirmed && hasParcelPrice) {
    const total = parcelPriceNum;
    return {
      isPriceConfirmed: true,
      showPendingBadge: false,
      shippingFee: Math.max(0, total - insuranceFee - remoteAreaFee),
      insuranceFee,
      remoteAreaFee,
      total,
      shippingIsEstimate: false,
    };
  }

  if (hasParcelPrice) {
    const total = parcelPriceNum;
    return {
      isPriceConfirmed: false,
      showPendingBadge,
      shippingFee: Math.max(0, total - insuranceFee - remoteAreaFee),
      insuranceFee,
      remoteAreaFee,
      total,
      shippingIsEstimate: true,
    };
  }

  if (estimatedBase != null) {
    const total = estimatedBase + insuranceFee + remoteAreaFee;
    return {
      isPriceConfirmed: false,
      showPendingBadge,
      shippingFee: estimatedBase,
      insuranceFee,
      remoteAreaFee,
      total,
      shippingIsEstimate: true,
    };
  }

  const partialTotal = insuranceFee + remoteAreaFee;
  return {
    isPriceConfirmed: false,
    showPendingBadge,
    shippingFee: null,
    insuranceFee,
    remoteAreaFee,
    total: partialTotal > 0 ? partialTotal : null,
    shippingIsEstimate: true,
  };
}
