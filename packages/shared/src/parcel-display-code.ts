/** Public parcel identifier for customer-facing copy (LINE flex, labels, payment UI). */
export function resolveParcelDisplayCode(input: {
  barcode?: string | null;
  smartpostTrackingcode?: string | null;
  trackingId?: string | null;
}): string {
  const barcode = input.barcode?.trim();
  if (barcode) return barcode;
  const smartpost = input.smartpostTrackingcode?.trim();
  if (smartpost) return smartpost;
  return input.trackingId?.trim() || "";
}
