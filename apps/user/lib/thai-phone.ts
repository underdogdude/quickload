/**
 * Normalize phone text for validation/storage:
 * - keep only common separators removed
 * - DO NOT convert country prefixes
 *
 * Allowed final format is local Thai number only: 0xxxxxxxxx
 * (therefore both 66... and +66... are invalid).
 */
export function normalizeThaiPhone(raw: string): string {
  return raw.trim().replace(/[\s\-().]/g, "");
}

/**
 * Thai subscriber numbers after normalization:
 * - Mobile 10 digits: 06x / 08x / 09x / 05x
 * - Bangkok metro: 02 + 7–8 digits
 * - Geographic: 03–07 area style + 7–8 digit subscriber (9–10 digits total)
 */
export function isValidThaiPhone(raw: string): boolean {
  const s = normalizeThaiPhone(raw);
  if (!/^\d+$/.test(s)) return false;
  return /^0(?:[689]\d{8}|5\d{8}|2\d{7,8}|[3-7]\d{7,8})$/.test(s);
}
