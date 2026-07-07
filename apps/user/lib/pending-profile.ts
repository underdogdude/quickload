export type PendingProfile = {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  birthDate?: string;
};

const PENDING_PROFILE_KEY = "quickload_pending_profile";
const PHONE_OTP_VERIFIED_KEY = "quickload_phone_otp_verified";

export function savePendingProfile(profile: PendingProfile): void {
  sessionStorage.setItem(PENDING_PROFILE_KEY, JSON.stringify(profile));
}

export function readPendingProfile(): PendingProfile | null {
  const raw = sessionStorage.getItem(PENDING_PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingProfile;
  } catch {
    return null;
  }
}

export function clearPendingProfile(): void {
  sessionStorage.removeItem(PENDING_PROFILE_KEY);
}

export function markPhoneOtpVerified(phone: string): void {
  sessionStorage.setItem(PHONE_OTP_VERIFIED_KEY, phone);
}

export function readPhoneOtpVerified(): string | null {
  return sessionStorage.getItem(PHONE_OTP_VERIFIED_KEY);
}

export function clearPhoneOtpVerified(): void {
  sessionStorage.removeItem(PHONE_OTP_VERIFIED_KEY);
}

export function maskThaiPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return phone;
  const local = digits.startsWith("66") ? `0${digits.slice(2)}` : digits;
  if (local.length === 10) {
    return `${local.slice(0, 3)}-xxx-${local.slice(6)}`;
  }
  return `${local.slice(0, 2)}-xxx-${local.slice(-4)}`;
}
