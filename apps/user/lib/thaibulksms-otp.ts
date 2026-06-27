import { normalizeThaiPhone } from "@/lib/thai-phone";

const OTP_API_BASE = "https://otp.thaibulksms.com/v1";

export class ThaibulkOtpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThaibulkOtpError";
  }
}

function getCredentials(): { apiKey: string; apiSecret: string } {
  const apiKey = process.env.THAIBULKSMS_OTP_API_KEY?.trim();
  const apiSecret = process.env.THAIBULKSMS_OTP_API_SECRET?.trim();
  if (!apiKey || !apiSecret) {
    throw new ThaibulkOtpError("Thaibulksms OTP credentials are not configured");
  }
  return { apiKey, apiSecret };
}

/** Thaibulksms expects msisdn without leading 0, e.g. 66812345678 */
export function toThaibulkMsisdn(localPhone: string): string {
  const digits = normalizeThaiPhone(localPhone).replace(/\D/g, "");
  if (digits.startsWith("66")) return digits;
  if (digits.startsWith("0")) return `66${digits.slice(1)}`;
  return digits;
}

function parseOtpError(json: unknown, fallback: string): string {
  if (!json || typeof json !== "object") return fallback;
  const root = json as Record<string, unknown>;
  const error = root.error as Record<string, unknown> | undefined;
  const errors = error?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const first = errors[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object" && "message" in first && typeof first.message === "string") {
      return first.message;
    }
  }
  if (typeof root.message === "string") return root.message;
  return fallback;
}

export async function requestThaibulkOtp(localPhone: string): Promise<{ token: string }> {
  const { apiKey, apiSecret } = getCredentials();
  const res = await fetch(`${OTP_API_BASE}/otp/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key: apiKey,
      secret: apiSecret,
      msisdn: toThaibulkMsisdn(localPhone),
    }),
  });

  const json = (await res.json().catch(() => null)) as { data?: { token?: string } } | null;
  if (!res.ok) {
    throw new ThaibulkOtpError(parseOtpError(json, "ส่งรหัส OTP ไม่สำเร็จ"));
  }

  const token = json?.data?.token;
  if (!token) {
    throw new ThaibulkOtpError("ส่งรหัส OTP ไม่สำเร็จ");
  }
  return { token };
}

export async function verifyThaibulkOtp(token: string, pin: string): Promise<void> {
  const { apiKey, apiSecret } = getCredentials();
  const res = await fetch(`${OTP_API_BASE}/otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key: apiKey,
      secret: apiSecret,
      token,
      pin,
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ThaibulkOtpError(parseOtpError(json, "รหัส OTP ไม่ถูกต้อง"));
  }
}
