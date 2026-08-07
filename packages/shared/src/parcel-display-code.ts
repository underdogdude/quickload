/**
 * Normalize a carrier barcode without making format assumptions.
 *
 * Thailand Post currently emits prefixes such as WA, WB, and JB, but the
 * carrier owns that namespace. Quickload intentionally does not whitelist a
 * prefix or enforce a fixed length. Scanner input is case-insensitive, so the
 * stored/displayed canonical form is trimmed uppercase text.
 */
export function normalizeCarrierBarcode(value?: string | null): string | null {
  const barcode = value?.trim();
  return barcode ? barcode.toUpperCase() : null;
}

/** Public parcel identifier for customer-facing copy (LINE flex, labels, payment UI). */
export function resolveParcelDisplayCode(input: {
  barcode?: string | null;
  smartpostTrackingcode?: string | null;
  trackingId?: string | null;
}): string {
  const barcode = normalizeCarrierBarcode(input.barcode);
  if (barcode) return barcode;
  const smartpost = input.smartpostTrackingcode?.trim();
  if (smartpost) return smartpost;
  return input.trackingId?.trim() || "";
}
