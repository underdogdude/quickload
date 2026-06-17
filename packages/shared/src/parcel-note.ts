/** User-entered remark on /send — stored on parcels.note (max 50 chars). */
export const MAX_PARCEL_NOTE_LENGTH = 50;

/** Trim and cap length; empty input becomes null for nullable DB column. */
export function sanitizeParcelNote(raw: unknown): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_PARCEL_NOTE_LENGTH);
}
