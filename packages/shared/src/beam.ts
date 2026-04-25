import crypto from "node:crypto";
import { computeOutstanding } from "./penalty";

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
 * Per docs.beamcheckout.com/charges/charges-api: amount is integer in the smallest unit
 * (satang for THB), and paymentMethod uses { qrPromptPay: { expiryTime }, paymentMethodType }.
 */
export async function createBeamPromptPayCharge({
  env,
  amount,
  currency,
  referenceId,
  idempotencyKey,
  returnUrl,
  expiryTime,
}: {
  env: BeamEnv;
  /** Decimal string in major units, e.g. "85.00". Converted to integer satang internally. */
  amount: string;
  currency: "THB";
  referenceId: string;
  idempotencyKey: string;
  /** Required by Beam. e.g. "https://example.com/pay/return". */
  returnUrl: string;
  /** ISO-8601 timestamp for QR expiry. */
  expiryTime: string;
}): Promise<BeamChargeResult> {
  if (!env.baseUrl || !env.merchantId || !env.apiKey) {
    throw new Error("Beam env not configured (BEAM_API_BASE_URL / BEAM_MERCHANT_ID / BEAM_API_KEY)");
  }
  const major = Number(amount);
  if (!Number.isFinite(major) || major <= 0) {
    throw new Error(`Invalid amount: ${amount}`);
  }
  const amountSatang = Math.round(major * 100);
  const basic = Buffer.from(`${env.merchantId}:${env.apiKey}`).toString("base64");
  const url = `${env.baseUrl.replace(/\/$/, "")}/api/v1/charges`;
  const body = {
    amount: amountSatang,
    currency,
    referenceId,
    returnUrl,
    paymentMethod: {
      paymentMethodType: "QR_PROMPT_PAY",
      qrPromptPay: { expiryTime },
    },
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
  const expiresAt = extractExpiresAt(obj);
  if (!chargeId || !qrPayload) {
    throw new Error(
      `Beam response missing chargeId or qrPayload. Raw: ${text.slice(0, 500)}`,
    );
  }
  return { chargeId, qrPayload, expiresAt, rawResponse: json };
}

function extractQrPayload(obj: Record<string, unknown>): string | null {
  // Beam returns the QR in one of two shapes depending on actionRequired:
  //   1. ENCODED_IMAGE → encodedImage.imageBase64Encoded (a base64 PNG); we wrap
  //      it as a data URL so the page can render it directly.
  //   2. A raw EMVCo PromptPay string under paymentMethod.qrPromptPay.qrCode.
  const encoded = (obj.encodedImage ?? {}) as Record<string, unknown>;
  const imageB64 = encoded.imageBase64Encoded;
  if (typeof imageB64 === "string" && imageB64.length > 0) {
    return `data:image/png;base64,${imageB64}`;
  }
  const pm = (obj.paymentMethod ?? {}) as Record<string, unknown>;
  const qpp = (pm.qrPromptPay ?? {}) as Record<string, unknown>;
  for (const candidate of [
    qpp.qrCode,
    qpp.qrPayload,
    qpp.qrString,
    pm.qrPayload,
    pm.qrCode,
    pm.qrCodeData,
    pm.qrString,
    obj.qrPayload,
    obj.qrCode,
  ]) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return null;
}

function extractExpiresAt(obj: Record<string, unknown>): string | null {
  const pm = (obj.paymentMethod ?? {}) as Record<string, unknown>;
  const qpp = (pm.qrPromptPay ?? {}) as Record<string, unknown>;
  for (const candidate of [qpp.expiryTime, qpp.expiresAt, obj.expiresAt, obj.expiry]) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return null;
}

import { eq, and, asc } from "drizzle-orm";
import { getDb, payments, parcels } from "./db";

/**
 * Idempotent state transition called by BOTH the webhook handler and the dev-simulate
 * endpoint. One DB transaction flips `payments.status` to 'succeeded' (only if currently
 * 'pending') and sets the parent parcel to `is_paid=true, status='paid'`.
 *
 * Returns the paymentId that was updated, or null if nothing changed (e.g. already
 * succeeded, unknown chargeId). Callers should still return HTTP 200 on null.
 */
export async function markPaymentSucceeded({
  providerChargeId,
  rawWebhookPayload,
}: {
  providerChargeId: string;
  rawWebhookPayload: unknown;
}): Promise<{ paymentId: string; parcelId: string; settled: boolean } | null> {
  const db = getDb();
  return await db.transaction(async (tx) => {
    const updated = await tx
      .update(payments)
      .set({
        status: "succeeded",
        paidAt: new Date(),
        rawWebhookPayload: rawWebhookPayload as any,
        updatedAt: new Date(),
      })
      .where(
        and(eq(payments.providerChargeId, providerChargeId), eq(payments.status, "pending")),
      )
      .returning({ id: payments.id, parcelId: payments.parcelId });
    const row = updated[0];
    if (!row) return null;

    // Trigger has updated parcels.amount_paid by now. Re-read parcel state
    // and find the earliest successful payment so the freeze-on-partial-payment
    // tier is anchored to the FIRST payment, not to this one.
    const [parcel] = await tx
      .select({
        price: parcels.price,
        penaltyClockStartedAt: parcels.penaltyClockStartedAt,
        amountPaid: parcels.amountPaid,
      })
      .from(parcels)
      .where(eq(parcels.id, row.parcelId))
      .limit(1);

    if (!parcel) {
      throw new Error(`markPaymentSucceeded: parcel ${row.parcelId} disappeared mid-transaction`);
    }

    const [firstPayment] = await tx
      .select({ paidAt: payments.paidAt })
      .from(payments)
      .where(and(eq(payments.parcelId, row.parcelId), eq(payments.status, "succeeded")))
      .orderBy(asc(payments.paidAt))
      .limit(1);

    const out = computeOutstanding({
      price: parcel.price ?? "0",
      penaltyClockStartedAt: parcel.penaltyClockStartedAt,
      amountPaid: parcel.amountPaid,
      firstSuccessfulPaymentAt: firstPayment?.paidAt ?? null,
      now: new Date(),
    });

    if (out.outstanding === 0) {
      await tx
        .update(parcels)
        .set({ isPaid: true, status: "paid", updatedAt: new Date() })
        .where(eq(parcels.id, row.parcelId));
    } else {
      // Partial settlement: keep parcel pending. The customer will pay the
      // remainder via a fresh QR.
      await tx
        .update(parcels)
        .set({ updatedAt: new Date() })
        .where(eq(parcels.id, row.parcelId));
    }

    return { paymentId: row.id, parcelId: row.parcelId, settled: out.outstanding === 0 };
  });
}
