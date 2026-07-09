/**
 * Pure validation logic for the parcel draft route.
 * Extracted so it can be tested without the Next.js runtime or DB.
 */
import {
  parsePositiveCm,
  validateParcelDimensionsCm,
  MIN_PARCEL_WEIGHT_GRAM,
  MAX_PARCEL_WEIGHT_GRAM,
} from "@/lib/parcel-dimensions";
import { parseSmartpostAddItemResponse } from "@/lib/smartpost-add-item";
import { mapSmartpostInnerToOrderFields } from "@/lib/smartpost-add-item";

function toPositiveNumber(value?: string): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export type DraftValidationInput = {
  senderId?: string;
  recipientId?: string;
  weightGram?: string;
  widthCm?: string;
  lengthCm?: string;
  heightCm?: string;
  parcelType?: string;
  smartpostAddItemResponse?: unknown;
};

export type DraftValidationResult =
  | { ok: true; trackingId: string; barcode: string | null }
  | { ok: false; error: string; status: 400 | 403 };

export type ExistingParcelForTracking = {
  id: string;
  trackingId: string;
  userId: string | null;
};

export type DraftIdempotencyDecision =
  | { kind: "create" }
  | { kind: "replay"; id: string; trackingId: string }
  | { kind: "conflict" };

/**
 * Decides what to do when a parcel with the draft's trackingId already
 * exists (checked either before insert, or after catching a unique-
 * constraint race on insert).
 *
 * - No existing row: proceed with creating a new parcel.
 * - Existing row owned by the same user: this is a client retry (e.g. the
 *   first request succeeded but the response never reached the client) —
 *   replay the original success instead of erroring or duplicating data.
 * - Existing row owned by a different user: carrier tracking codes are
 *   globally unique, so this should be impossible — treat as a conflict.
 */
export function resolveDraftIdempotency(
  existing: ExistingParcelForTracking | undefined,
  sessionUserId: string,
): DraftIdempotencyDecision {
  if (!existing) return { kind: "create" };
  if (existing.userId !== sessionUserId) return { kind: "conflict" };
  return { kind: "replay", id: existing.id, trackingId: existing.trackingId };
}

/**
 * Validates all parcel draft fields and extracts trackingId/barcode from the
 * Smartpost response. Returns an error descriptor or the extracted IDs.
 */
export function validateDraftPayload(body: DraftValidationInput): DraftValidationResult {
  if (!body.senderId?.trim() || !body.recipientId?.trim()) {
    return { ok: false, error: "senderId and recipientId are required", status: 400 };
  }

  const weightGram = toPositiveNumber(body.weightGram);
  const widthCm = parsePositiveCm(body.widthCm);
  const lengthCm = parsePositiveCm(body.lengthCm);
  const heightCm = parsePositiveCm(body.heightCm);

  if (!weightGram || widthCm === null || lengthCm === null || heightCm === null) {
    return { ok: false, error: "weight and dimensions are required", status: 400 };
  }

  if (weightGram < MIN_PARCEL_WEIGHT_GRAM || weightGram > MAX_PARCEL_WEIGHT_GRAM) {
    return {
      ok: false,
      error:
        weightGram < MIN_PARCEL_WEIGHT_GRAM
          ? `น้ำหนักพัสดุต้องไม่ต่ำกว่า ${MIN_PARCEL_WEIGHT_GRAM} กรัม`
          : "น้ำหนักพัสดุต้องไม่เกิน 30 กิโลกรัม หรือ 30,000 กรัม",
      status: 400,
    };
  }

  const dimensionError = validateParcelDimensionsCm({ widthCm, lengthCm, heightCm });
  if (dimensionError) {
    return { ok: false, error: dimensionError, status: 400 };
  }

  if (!body.parcelType?.trim()) {
    return { ok: false, error: "parcelType is required", status: 400 };
  }

  if (body.smartpostAddItemResponse == null) {
    return {
      ok: false,
      error: "smartpostAddItemResponse is required; parcels must be created via Smartpost addItem",
      status: 400,
    };
  }

  const parsed = parseSmartpostAddItemResponse(body.smartpostAddItemResponse);
  if (!parsed) {
    return { ok: false, error: "Invalid smartpostAddItemResponse", status: 400 };
  }

  if (parsed.statuscode && parsed.statuscode !== "201") {
    return { ok: false, error: "Smartpost order not successful", status: 400 };
  }

  const fields = mapSmartpostInnerToOrderFields(parsed.inner);
  const trackingId = fields.smartpostTrackingcode?.trim() || fields.barcode?.trim() || null;
  if (!trackingId) {
    return {
      ok: false,
      error: "Smartpost did not return a tracking code or barcode. Please contact Smartpost support.",
      status: 400,
    };
  }

  return {
    ok: true,
    trackingId,
    barcode: fields.barcode?.trim() || null,
  };
}
