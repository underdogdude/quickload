import crypto from "node:crypto";

/** Beam webhook HMAC verification per docs.beamcheckout.com/webhook/webhook. */
export function verifyBeamWebhookSignature({
  rawBody,
  signatureHeader,
  hmacKeyBase64,
}: {
  rawBody: string;
  signatureHeader: string | null | undefined;
  hmacKeyBase64: string;
}): boolean {
  if (!signatureHeader) return false;
  if (!hmacKeyBase64) return false;
  let key: Buffer;
  try {
    key = Buffer.from(hmacKeyBase64, "base64");
  } catch {
    return false;
  }
  const expected = crypto.createHmac("sha256", key).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export type BeamEnv = {
  baseUrl: string;
  merchantId: string;
  apiKey: string;
  hmacKeyBase64: string;
};

export function readBeamEnv(): BeamEnv {
  const baseUrl = process.env.BEAM_API_BASE_URL ?? "";
  const merchantId = process.env.BEAM_MERCHANT_ID ?? "";
  const apiKey = process.env.BEAM_API_KEY ?? "";
  const hmacKeyBase64 = process.env.BEAM_WEBHOOK_HMAC_KEY ?? "";
  return { baseUrl, merchantId, apiKey, hmacKeyBase64 };
}

export type BeamChargeResult = {
  chargeId: string;
  qrPayload: string;
  /** ISO-8601 timestamp; null if Beam did not return one. */
  expiresAt: string | null;
  rawResponse: unknown;
};

/**
 * Creates a PromptPay charge via Beam Charges API.
 * Request shape is based on docs.beamcheckout.com/charges/charges-api; if Beam's live
 * playground response shape differs from the field names below, adjust the extraction
 * block in this function (and log `rawResponse` for debugging).
 */
export async function createBeamPromptPayCharge({
  env,
  amount,
  currency,
  referenceId,
  idempotencyKey,
}: {
  env: BeamEnv;
  /** Decimal string, e.g. "85.00". */
  amount: string;
  currency: "THB";
  referenceId: string;
  idempotencyKey: string;
}): Promise<BeamChargeResult> {
  if (!env.baseUrl || !env.merchantId || !env.apiKey) {
    throw new Error("Beam env not configured (BEAM_API_BASE_URL / BEAM_MERCHANT_ID / BEAM_API_KEY)");
  }
  const basic = Buffer.from(`${env.merchantId}:${env.apiKey}`).toString("base64");
  const url = `${env.baseUrl.replace(/\/$/, "")}/api/v1/charges`;
  const body = {
    amount,
    currency,
    referenceId,
    paymentMethod: { type: "QR_PROMPT_PAY" },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // leave as null; we'll surface via error text.
  }
  if (!res.ok) {
    throw new Error(`Beam charges API returned ${res.status}: ${text.slice(0, 500)}`);
  }
  const obj = (json ?? {}) as Record<string, unknown>;
  const chargeId =
    typeof obj.id === "string"
      ? obj.id
      : typeof obj.chargeId === "string"
        ? obj.chargeId
        : null;
  const qrPayload = extractQrPayload(obj);
  const expiresAt =
    typeof obj.expiresAt === "string"
      ? obj.expiresAt
      : typeof obj.expiry === "string"
        ? obj.expiry
        : null;
  if (!chargeId || !qrPayload) {
    throw new Error(
      `Beam response missing chargeId or qrPayload. Raw: ${text.slice(0, 500)}`,
    );
  }
  return { chargeId, qrPayload, expiresAt, rawResponse: json };
}

function extractQrPayload(obj: Record<string, unknown>): string | null {
  // Shape uncertainty: Beam's response for QR_PROMPT_PAY may nest the payload under
  // paymentMethod.qrCode, qrCodeData, qrPayload, or return a base64 image. We accept
  // common shapes and fall through otherwise.
  const pm = (obj.paymentMethod ?? {}) as Record<string, unknown>;
  for (const candidate of [pm.qrPayload, pm.qrCode, pm.qrCodeData, pm.qrString, obj.qrPayload, obj.qrCode]) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return null;
}
