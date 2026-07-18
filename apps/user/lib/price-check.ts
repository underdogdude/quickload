import { getRemoteAreaSurcharge } from "@quickload/shared/parcel-price-breakdown";

export type PriceCheckBreakdown = {
  basePrice: number;
  remoteAreaFee: number;
  estimatedTotal: number;
};

export function calculatePriceCheckBreakdown(
  basePrice: number,
  destinationZipcode: string,
): PriceCheckBreakdown {
  if (!Number.isFinite(basePrice) || basePrice < 0) {
    throw new Error("Invalid base price");
  }

  const normalizedBasePrice = Math.round(basePrice);
  const remoteAreaFee = getRemoteAreaSurcharge(destinationZipcode);

  return {
    basePrice: normalizedBasePrice,
    remoteAreaFee,
    estimatedTotal: normalizedBasePrice + remoteAreaFee,
  };
}
