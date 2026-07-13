/**
 * Pure validation logic for POST /api/smartpost/add-item.
 * Extracted for testing without DB or Next.js runtime.
 */
import { MIN_PARCEL_WEIGHT_GRAM, MAX_PARCEL_WEIGHT_GRAM } from "@/lib/parcel-dimensions";

function toPositiveNumber(value?: string): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export type AddItemValidationInput = {
  senderId?: string;
  recipientId?: string;
  weightGram?: string;
};

export type AddItemValidationResult =
  | { ok: true; weightGram: number }
  | { ok: false; error: string; status: 400 };

export function validateAddItemPayload(body: AddItemValidationInput): AddItemValidationResult {
  const weightGram = toPositiveNumber(body.weightGram);

  if (!body.senderId?.trim() || !body.recipientId?.trim() || !weightGram) {
    return {
      ok: false,
      error: "senderId, recipientId and weightGram are required",
      status: 400,
    };
  }

  if (weightGram < MIN_PARCEL_WEIGHT_GRAM) {
    return {
      ok: false,
      error: `น้ำหนักพัสดุต้องไม่ต่ำกว่า ${MIN_PARCEL_WEIGHT_GRAM} กรัม`,
      status: 400,
    };
  }

  if (weightGram > MAX_PARCEL_WEIGHT_GRAM) {
    return {
      ok: false,
      error: "น้ำหนักพัสดุต้องไม่เกิน 30 กิโลกรัม หรือ 30,000 กรัม",
      status: 400,
    };
  }

  return { ok: true, weightGram };
}

export function normalizeSmartpostReferenceId(value?: string): string {
  const referenceId = value?.trim();
  if (!referenceId) return "";
  if (!/^[A-Za-z0-9:_-]{3,120}$/.test(referenceId)) return "";
  return referenceId;
}

/**
 * Determines whether the Smartpost HTTP response should be treated as success.
 * Smartpost returns HTTP 201 for success, but some configurations return HTTP 200
 * with statuscode "201" in the body.
 */
export function isSmartpostSuccess(httpStatus: number, bodyStatuscode: string): boolean {
  return httpStatus === 201 || bodyStatuscode === "201";
}

const RETRYABLE_SMARTPOST_STATUS_CODES = new Set(["408", "425", "429", "500", "502", "503", "504"]);

export type SmartpostFailureClassification = {
  retryable: boolean;
  severity: "warning" | "critical";
  clientStatus: number;
  userFacingError: string;
};

export function isRetryableSmartpostFailure(
  httpStatus: number,
  bodyStatuscode: string,
  message = "",
): boolean {
  const normalizedHttpStatus = String(httpStatus);
  const normalizedBodyStatus = bodyStatuscode.trim();
  if (RETRYABLE_SMARTPOST_STATUS_CODES.has(normalizedHttpStatus)) return true;
  if (RETRYABLE_SMARTPOST_STATUS_CODES.has(normalizedBodyStatus)) return true;
  return /timeout|temporar|unavailable|unexpected response|server/i.test(message);
}

export function classifySmartpostFailure(input: {
  httpStatus: number;
  bodyStatuscode: string;
  message?: string;
}): SmartpostFailureClassification {
  const retryable = isRetryableSmartpostFailure(input.httpStatus, input.bodyStatuscode, input.message ?? "");
  if (retryable) {
    return {
      retryable: true,
      severity: "warning",
      clientStatus: input.httpStatus === 504 ? 504 : 503,
      userFacingError: "ขณะนี้ระบบไปรษณีย์ไทยไม่พร้อมให้บริการ กรุณาลองใหม่อีกครั้ง",
    };
  }

  return {
    retryable: false,
    severity: "critical",
    clientStatus: 502,
    userFacingError: input.message?.trim() || `Smartpost error ${input.httpStatus}`,
  };
}

/**
 * Normalizes the Smartpost response body to always include statuscode "201"
 * so that the downstream draft route can verify without re-reading HTTP status.
 *
 * NOTE: statuscode is placed at the END of the spread so it always wins over
 * whatever the upstream body returned (fixes a bug where body statuscode "200"
 * would override our injected "201" when statuscode was placed first).
 */
export function normalizeSuccessResponse(body: unknown): Record<string, unknown> {
  if (typeof body === "object" && body !== null && !Array.isArray(body)) {
    return { ...(body as Record<string, unknown>), statuscode: "201" };
  }
  return { statuscode: "201", message: "Create successful" };
}
