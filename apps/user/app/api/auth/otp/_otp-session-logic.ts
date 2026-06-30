/**
 * Pure business-rule functions extracted from the OTP request/verify route handlers.
 * Keeping them here makes them testable without the Next.js runtime.
 */

const RESEND_COOLDOWN_MS = 60_000;

export type OtpRequestSession = {
  phoneOtpPhone?: string;
  phoneOtpRequestedAt?: number;
};

export type OtpVerifySession = {
  phoneOtpToken?: string;
  phoneOtpPhone?: string;
  phoneOtpVerifiedFor?: string;
};

/**
 * Returns seconds remaining in the cooldown, or null when the cooldown has
 * not started / expired / is for a different phone.
 */
export function getOtpResendCooldownSec(
  session: OtpRequestSession,
  phone: string,
  now: number,
): number | null {
  if (
    session.phoneOtpPhone === phone &&
    session.phoneOtpRequestedAt != null &&
    now - session.phoneOtpRequestedAt < RESEND_COOLDOWN_MS
  ) {
    return Math.ceil((RESEND_COOLDOWN_MS - (now - session.phoneOtpRequestedAt)) / 1000);
  }
  return null;
}

/**
 * Returns true when the phone is already verified and no new token needs to
 * be consumed (idempotent verify path).
 */
export function isAlreadyVerifiedFor(session: OtpVerifySession, phone: string): boolean {
  return !session.phoneOtpToken && session.phoneOtpVerifiedFor === phone;
}

/**
 * Returns true when a pending token exists and it matches the supplied phone.
 * False means "no token" or "token is for a different phone".
 */
export function hasPendingTokenForPhone(session: OtpVerifySession, phone: string): boolean {
  return Boolean(session.phoneOtpToken) && session.phoneOtpPhone === phone;
}
