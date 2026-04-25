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
