/**
 * Pure business-rule functions extracted from PATCH /api/me.
 * Testable without the Next.js runtime.
 */
import { normalizeThaiPhone } from "@/lib/thai-phone";

export type PatchProfileSession = {
  phoneOtpVerifiedFor?: string;
};

/**
 * Returns true when the normalized new phone differs from the stored phone,
 * meaning the user MUST have OTP-verified the new number before saving.
 */
export function phoneHasChanged(
  storedPhone: string | null | undefined,
  newPhone: string,
): boolean {
  return normalizeThaiPhone(newPhone) !== normalizeThaiPhone(storedPhone ?? "");
}

/**
 * Returns true when the session holds a verified OTP for exactly the new phone.
 * Used as the gate before allowing a phone change in PATCH /api/me.
 */
export function isOtpVerifiedForPhone(session: PatchProfileSession, newPhone: string): boolean {
  return session.phoneOtpVerifiedFor === normalizeThaiPhone(newPhone);
}
