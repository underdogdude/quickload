import { createHmac, timingSafeEqual } from "crypto";

export const ISHIP_RELAY_MAX_AGE_SECONDS = 300;

function signatureHex(rawBody: string, timestamp: string, secret: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function signIshipRelayPayload(rawBody: string, timestamp: string, secret: string): string {
  return `sha256=${signatureHex(rawBody, timestamp, secret)}`;
}

export function verifyIshipRelaySignature(input: {
  rawBody: string;
  timestamp: string;
  signature: string;
  secret: string;
  nowMs?: number;
}): boolean {
  if (!input.rawBody || !input.secret || !/^\d{10}$/.test(input.timestamp)) return false;

  const timestampSeconds = Number(input.timestamp);
  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (
    !Number.isSafeInteger(timestampSeconds) ||
    Math.abs(nowSeconds - timestampSeconds) > ISHIP_RELAY_MAX_AGE_SECONDS
  ) {
    return false;
  }

  const match = /^sha256=([a-f0-9]{64})$/i.exec(input.signature.trim());
  if (!match) return false;

  const presented = Buffer.from(match[1], "hex");
  const expected = Buffer.from(signatureHex(input.rawBody, input.timestamp, input.secret), "hex");
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}
