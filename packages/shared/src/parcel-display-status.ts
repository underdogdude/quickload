import {
  mapThaiPostStatus,
  resolveThaiPostStatusMetaCode,
  type ParcelFlowStatus,
} from "./thai-post-status";
import { thaiPostStatusDateToMs } from "./thai-post-webhook-history";

/** Parcel `status` values that mean “not yet in carrier tracking” (incl. legacy `paid`). */
export const PRE_PAYMENT_PARCEL_STATUSES = new Set<string>([
  "awaiting_actual_weight",
  "pending_payment",
  "paid",
]);

export type ParcelDisplayStatusInput = {
  status: string;
  isPaid: boolean;
  thaiPostEvents?: Array<{
    statusCode: string;
    statusDateRaw?: string | null;
    createdAt: string;
  }>;
};

/**
 * DB update after Beam payment succeeds: flip `is_paid` only; advance `status` to
 * `registered` when still in a pre-shipment state, never overwrite carrier progress.
 */
export function parcelStatusAfterPaymentSucceeded(currentStatus: string): string {
  if (PRE_PAYMENT_PARCEL_STATUSES.has(currentStatus)) return "registered";
  return currentStatus;
}

function parcelStatusFromLatestWebhookEvent(
  events: NonNullable<ParcelDisplayStatusInput["thaiPostEvents"]>,
): ParcelFlowStatus | null {
  if (events.length === 0) return null;
  const chronological = [...events].sort((a, b) => {
    const ta = thaiPostStatusDateToMs(a.statusDateRaw) ?? new Date(a.createdAt).getTime();
    const tb = thaiPostStatusDateToMs(b.statusDateRaw) ?? new Date(b.createdAt).getTime();
    if (ta !== tb) return ta - tb;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
  const latest = chronological[chronological.length - 1];
  const code = resolveThaiPostStatusMetaCode(latest.statusCode);
  if (!code) return null;
  return mapThaiPostStatus(code).parcelStatus;
}

/**
 * UI / API display status: when paid, show carrier progress (DB row or latest webhook),
 * not a payment milestone like legacy `paid` → “ลงทะเบียนแล้ว”.
 */
export function resolveParcelDisplayStatus(parcel: ParcelDisplayStatusInput): string {
  const fromWebhook = parcel.thaiPostEvents?.length
    ? parcelStatusFromLatestWebhookEvent(parcel.thaiPostEvents)
    : null;

  if (!parcel.isPaid) return parcel.status;

  if (!PRE_PAYMENT_PARCEL_STATUSES.has(parcel.status)) return parcel.status;

  if (fromWebhook && fromWebhook !== "pending_payment" && fromWebhook !== "awaiting_actual_weight") {
    return fromWebhook;
  }

  return "registered";
}
