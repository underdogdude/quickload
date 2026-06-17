import crypto from "node:crypto";
import { computeOutstanding } from "./penalty";
import type { BeamPaymentMethodType } from "./payment-methods";

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

export type BeamActionRequired = "NONE" | "REDIRECT" | "ENCODED_IMAGE";

export type BeamChargeResult = {
  chargeId: string;
  /** Populated when actionRequired === "ENCODED_IMAGE". */
  qrPayload: string | null;
  /** Populated when actionRequired === "REDIRECT". */
  redirectUrl: string | null;
  actionRequired: BeamActionRequired;
  /** ISO-8601 timestamp; null if Beam did not return one. */
  expiresAt: string | null;
  rawResponse: unknown;
};

/**
 * Creates a Beam charge for the given paymentMethodType.
 * Per docs.beamcheckout.com/charges/charges-api: amount is integer in the smallest
 * unit (satang for THB).
 *
 * Each method ships an empty object under its respective key (kplus / make /
 * scbEasy / trueMoney). Beam Playground returns ENCODED_IMAGE for these methods.
 */
export async function createBeamCharge({
  env,
  paymentMethodType,
  amount,
  currency,
  referenceId,
  idempotencyKey,
  returnUrl,
  expiryTime,
}: {
  env: BeamEnv;
  paymentMethodType: BeamPaymentMethodType;
  /** Decimal string in major units, e.g. "85.00". Converted to integer satang internally. */
  amount: string;
  currency: "THB";
  referenceId: string;
  idempotencyKey: string;
  returnUrl: string;
  /** ISO-8601 timestamp passed through for API compatibility; unused by app methods. */
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

  const paymentMethod: Record<string, unknown> = { paymentMethodType };
  switch (paymentMethodType) {
    case "QR_PROMPT_PAY":
      paymentMethod.qrPromptPay = { expiryTime };
      break;
    case "KPLUS":
      paymentMethod.kplus = {};
      break;
    case "MAKE":
      paymentMethod.make = {};
      break;
    case "SCB_EASY":
      paymentMethod.scbEasy = {};
      break;
    case "TRUE_MONEY":
      paymentMethod.trueMoney = {};
      break;
  }

  const body = {
    amount: amountSatang,
    currency,
    referenceId,
    returnUrl,
    paymentMethod,
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
    throw new Error(
      `Beam charges API returned ${res.status} for ${paymentMethodType}: ${text.slice(0, 500)}`,
    );
  }
  const obj = (json ?? {}) as Record<string, unknown>;
  const chargeId =
    typeof obj.id === "string"
      ? obj.id
      : typeof obj.chargeId === "string"
        ? obj.chargeId
        : null;
  const actionRequired = extractActionRequired(obj);
  const qrPayload = extractQrPayload(obj);
  const redirectUrl = extractRedirectUrl(obj);
  const expiresAt = extractExpiresAt(obj);
  if (!chargeId) {
    throw new Error(
      `Beam response missing chargeId for ${paymentMethodType}. Raw: ${text.slice(0, 500)}`,
    );
  }
  if (paymentMethodType === "QR_PROMPT_PAY" && !qrPayload) {
    throw new Error(
      `Beam QR_PROMPT_PAY response missing qrPayload. Raw: ${text.slice(0, 500)}`,
    );
  }
  return { chargeId, qrPayload, redirectUrl, actionRequired, expiresAt, rawResponse: json };
}

function extractActionRequired(obj: Record<string, unknown>): BeamActionRequired {
  if (extractRedirectUrl(obj)) return "REDIRECT";
  const raw = obj.actionRequired;
  if (typeof raw === "string") {
    const u = raw.toUpperCase();
    if (u === "REDIRECT" || u === "REDIRECT_TO_URL") return "REDIRECT";
    if (u === "ENCODED_IMAGE") return "ENCODED_IMAGE";
    if (u === "NONE") return "NONE";
    if (raw.length > 0) console.info(`[beam] unknown actionRequired: "${raw}"`);
  }
  // Fallback: infer from response shape.
  if (extractRedirectUrl(obj)) return "REDIRECT";
  if (extractQrPayload(obj)) return "ENCODED_IMAGE";
  return "NONE";
}

function extractRedirectUrl(obj: Record<string, unknown>): string | null {
  const beamRedirect = obj.redirect as Record<string, unknown> | undefined;
  if (
    beamRedirect &&
    typeof beamRedirect.redirectUrl === "string" &&
    beamRedirect.redirectUrl.length > 0
  ) {
    return beamRedirect.redirectUrl;
  }
  const direct = obj.redirectUrl;
  if (typeof direct === "string" && direct.length > 0) return direct;
  const nextAction = obj.nextAction as Record<string, unknown> | undefined;
  if (nextAction && typeof nextAction.redirectUrl === "string" && nextAction.redirectUrl.length > 0) {
    return nextAction.redirectUrl;
  }
  const rawActionRequired = obj.actionRequired;
  if (
    rawActionRequired !== null &&
    typeof rawActionRequired === "object" &&
    "redirectUrl" in rawActionRequired &&
    typeof (rawActionRequired as Record<string, unknown>).redirectUrl === "string"
  ) {
    const url = (rawActionRequired as Record<string, unknown>).redirectUrl as string;
    if (url.length > 0) return url;
  }
  const pm = (obj.paymentMethod ?? {}) as Record<string, unknown>;
  for (const key of ["kplus", "make", "scbEasy", "trueMoney"]) {
    const sub = pm[key] as Record<string, unknown> | undefined;
    if (sub && typeof sub.redirectUrl === "string" && sub.redirectUrl.length > 0) {
      return sub.redirectUrl;
    }
  }
  // Beam Playground: app methods may return a payment URL in encodedImage.rawData.
  const paymentMethodType = obj.paymentMethodType;
  if (paymentMethodType !== "QR_PROMPT_PAY") {
    const encoded = (obj.encodedImage ?? {}) as Record<string, unknown>;
    const rawData = encoded.rawData;
    if (typeof rawData === "string" && /^https?:\/\//i.test(rawData)) {
      return rawData;
    }
  }
  return null;
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

import { eq, and, inArray, sql } from "drizzle-orm";
import { getDb, payments, parcels } from "./db";
import { readBulkMasterMeta } from "./bulk-payment";
import { parcelStatusAfterPaymentSucceeded } from "./parcel-display-status";

/**
 * Idempotent state transition called by BOTH the webhook handler and the dev-simulate
 * endpoint. One DB transaction flips `payments.status` to 'succeeded' (only if currently
 * 'pending') and sets the parent parcel to `is_paid=true`, advancing `status` to
 * `registered` only when still awaiting weight / payment (never overwrites carrier progress).
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
}): Promise<{ paymentId: string; parcelId: string; settled: boolean; bulk?: boolean } | null> {
  const db = getDb();
  return await db.transaction(async (tx) => {
    const [masterRow] = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.providerChargeId, providerChargeId), eq(payments.status, "pending")))
      .limit(1);
    if (!masterRow) return null;

    const bulkMeta = readBulkMasterMeta(masterRow.rawCreateResponse);
    if (bulkMeta) {
      const paymentIds = [masterRow.id, ...bulkMeta.childPaymentIds];
      const paidAt = new Date();
      await tx
        .update(payments)
        .set({
          status: "succeeded",
          paidAt,
          rawWebhookPayload: rawWebhookPayload as any,
          updatedAt: paidAt,
        })
        .where(and(inArray(payments.id, paymentIds), eq(payments.status, "pending")));

      await tx
        .update(parcels)
        .set({
          isPaid: true,
          status: sql`case when status in ('pending_payment', 'awaiting_actual_weight', 'paid') then 'registered' else status end`,
          updatedAt: paidAt,
        })
        .where(inArray(parcels.id, bulkMeta.parcelIds));

      return {
        paymentId: masterRow.id,
        parcelId: masterRow.parcelId,
        settled: true,
        bulk: true,
      };
    }

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

    // Trigger has updated parcels.amount_paid by now. Re-read parcel state.
    const [parcel] = await tx
      .select({
        price: parcels.price,
        amountPaid: parcels.amountPaid,
        status: parcels.status,
      })
      .from(parcels)
      .where(eq(parcels.id, row.parcelId))
      .limit(1);

    if (!parcel) {
      throw new Error(`markPaymentSucceeded: parcel ${row.parcelId} disappeared mid-transaction`);
    }

    const out = computeOutstanding({
      price: parcel.price ?? "0",
      amountPaid: parcel.amountPaid,
    });

    await tx
      .update(parcels)
      .set({
        isPaid: true,
        status: parcelStatusAfterPaymentSucceeded(parcel.status),
        updatedAt: new Date(),
      })
      .where(eq(parcels.id, row.parcelId));

    return { paymentId: row.id, parcelId: row.parcelId, settled: out.outstanding === 0 };
  });
}

export async function markPaymentTerminalStatus({
  providerChargeId,
  nextStatus,
  rawWebhookPayload,
}: {
  providerChargeId: string;
  nextStatus: "failed" | "expired" | "canceled";
  rawWebhookPayload: unknown;
}): Promise<{ paymentId: string; parcelId: string; bulk?: boolean } | null> {
  const db = getDb();
  return await db.transaction(async (tx) => {
    const [masterRow] = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.providerChargeId, providerChargeId), eq(payments.status, "pending")))
      .limit(1);
    if (!masterRow) return null;

    const bulkMeta = readBulkMasterMeta(masterRow.rawCreateResponse);
    const now = new Date();
    if (bulkMeta) {
      const paymentIds = [masterRow.id, ...bulkMeta.childPaymentIds];
      await tx
        .update(payments)
        .set({
          status: nextStatus,
          rawWebhookPayload: rawWebhookPayload as any,
          updatedAt: now,
        })
        .where(and(inArray(payments.id, paymentIds), eq(payments.status, "pending")));
      return { paymentId: masterRow.id, parcelId: masterRow.parcelId, bulk: true };
    }

    const updated = await tx
      .update(payments)
      .set({
        status: nextStatus,
        rawWebhookPayload: rawWebhookPayload as any,
        updatedAt: now,
      })
      .where(
        and(eq(payments.providerChargeId, providerChargeId), eq(payments.status, "pending")),
      )
      .returning({ id: payments.id, parcelId: payments.parcelId });
    const row = updated[0];
    if (!row) return null;
    return { paymentId: row.id, parcelId: row.parcelId };
  });
}

/**
 * GET /api/v1/charges/{chargeId} — same auth as create.
 * Used to reconcile DB when Beam finalizes a charge but does not emit a documented webhook
 * (e.g. PromptPay failure: docs only guarantee charge.succeeded for success).
 */
export async function fetchBeamCharge(
  env: BeamEnv,
  providerChargeId: string,
): Promise<Record<string, unknown>> {
  if (!env.baseUrl || !env.merchantId || !env.apiKey) {
    throw new Error("Beam env not configured (BEAM_API_BASE_URL / BEAM_MERCHANT_ID / BEAM_API_KEY)");
  }
  const basic = Buffer.from(`${env.merchantId}:${env.apiKey}`).toString("base64");
  const url = `${env.baseUrl.replace(/\/$/, "")}/api/v1/charges/${encodeURIComponent(providerChargeId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${basic}`, Accept: "application/json" },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* leave null */
  }
  if (!res.ok) {
    throw new Error(`Beam GET charge returned ${res.status}: ${text.slice(0, 500)}`);
  }
  return (json ?? {}) as Record<string, unknown>;
}

export type ReconcileBeamPaymentResult =
  | { synced: false; reason: "not_configured" | "still_pending" | "fetch_error" | "unknown_status" }
  | { synced: true; outcome: "succeeded"; paymentId: string; parcelId: string }
  | {
      synced: true;
      outcome: "failed" | "expired" | "canceled";
      paymentId: string;
      parcelId: string;
    };

function mapBeamApiChargeStatus(
  statusRaw: unknown,
): "pending" | "succeeded" | "failed" | "expired" | "canceled" | "unknown" {
  if (typeof statusRaw !== "string" || !statusRaw.trim()) return "unknown";
  const u = statusRaw.toUpperCase();
  if (
    u === "PENDING" ||
    u === "PROCESSING" ||
    u === "REQUIRES_ACTION" ||
    u === "AWAITING_PAYMENT"
  ) {
    return "pending";
  }
  if (u === "SUCCEEDED" || u === "SUCCESS") return "succeeded";
  if (u === "FAILED") return "failed";
  if (u === "EXPIRED") return "expired";
  if (u === "CANCELED" || u === "CANCELLED") return "canceled";
  return "unknown";
}

/**
 * Poll Beam for the current charge status and apply the same DB transitions as webhooks.
 * Safe to call on every client poll while payment row is pending.
 */
export async function reconcilePendingPaymentFromBeamApi(
  providerChargeId: string,
): Promise<ReconcileBeamPaymentResult> {
  const env = readBeamEnv();
  if (!env.baseUrl || !env.merchantId || !env.apiKey) {
    return { synced: false, reason: "not_configured" };
  }
  let raw: Record<string, unknown>;
  try {
    raw = await fetchBeamCharge(env, providerChargeId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[beam] reconcile fetchBeamCharge:", msg);
    return { synced: false, reason: "fetch_error" };
  }
  const mapped = mapBeamApiChargeStatus(raw.status);
  if (mapped === "pending") {
    return { synced: false, reason: "still_pending" };
  }
  if (mapped === "unknown") {
    if (typeof raw.status === "string" && raw.status.length > 0) {
      console.info(`[beam] reconcile: unknown status "${raw.status}" charge=${providerChargeId}`);
    }
    return { synced: false, reason: "unknown_status" };
  }
  if (mapped === "succeeded") {
    const r = await markPaymentSucceeded({ providerChargeId, rawWebhookPayload: raw });
    if (!r) return { synced: false, reason: "still_pending" };
    return { synced: true, outcome: "succeeded", paymentId: r.paymentId, parcelId: r.parcelId };
  }
  const terminal = mapped;
  const r = await markPaymentTerminalStatus({
    providerChargeId,
    nextStatus: terminal,
    rawWebhookPayload: raw,
  });
  if (!r) return { synced: false, reason: "still_pending" };
  return { synced: true, outcome: terminal, paymentId: r.paymentId, parcelId: r.parcelId };
}

/** Extract charge id from Beam charge-shaped webhook or API JSON. */
export function extractBeamChargeId(obj: Record<string, unknown>): string | null {
  if (typeof obj.chargeId === "string" && obj.chargeId.length > 0) return obj.chargeId;
  if (typeof obj.id === "string" && obj.id.length > 0) return obj.id;
  const data = obj.data as Record<string, unknown> | undefined;
  if (data) {
    if (typeof data.chargeId === "string" && data.chargeId.length > 0) return data.chargeId;
    if (typeof data.id === "string" && data.id.length > 0) return data.id;
  }
  return null;
}
