/** Buddhist Era offset from Common Era (Gregorian). */
export const BE_OFFSET = 543;

export const MIN_BIRTH_CE_YEAR = 1920;

const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

export function ceToBeYear(ceYear: number): number {
  return ceYear + BE_OFFSET;
}

export function beToCeYear(beYear: number): number {
  return beYear - BE_OFFSET;
}

export function daysInMonth(ceYear: number, month: number): number {
  return new Date(ceYear, month, 0).getDate();
}

export function parseIsoDate(iso: string): { ceYear: number; month: number; day: number } | null {
  const match = ISO_DATE_REGEX.exec(iso.trim());
  if (!match) return null;

  const ceYear = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(ceYear) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (!isValidBirthDateParts(ceYear, month, day)) return null;

  return { ceYear, month, day };
}

export function formatIsoDate(ceYear: number, month: number, day: number): string {
  return `${String(ceYear).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** True when parts form a real calendar date within allowed birth range (not in the future). */
export function isValidBirthDateParts(ceYear: number, month: number, day: number, now = new Date()): boolean {
  if (!Number.isInteger(ceYear) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1) return false;
  if (ceYear < MIN_BIRTH_CE_YEAR || ceYear > now.getFullYear()) return false;
  if (day > daysInMonth(ceYear, month)) return false;

  const candidate = new Date(ceYear, month - 1, day);
  if (
    candidate.getFullYear() !== ceYear ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    return false;
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return candidate.getTime() <= today.getTime();
}

export function maxBirthCeYear(now = new Date()): number {
  return now.getFullYear();
}

export function birthYearOptions(now = new Date()): number[] {
  const maxCe = maxBirthCeYear(now);
  const years: number[] = [];
  for (let ce = maxCe; ce >= MIN_BIRTH_CE_YEAR; ce -= 1) {
    years.push(ceToBeYear(ce));
  }
  return years;
}

export const THAI_MONTHS = [
  { value: 1, label: "ม.ค." },
  { value: 2, label: "ก.พ." },
  { value: 3, label: "มี.ค." },
  { value: 4, label: "เม.ย." },
  { value: 5, label: "พ.ค." },
  { value: 6, label: "มิ.ย." },
  { value: 7, label: "ก.ค." },
  { value: 8, label: "ส.ค." },
  { value: 9, label: "ก.ย." },
  { value: 10, label: "ต.ค." },
  { value: 11, label: "พ.ย." },
  { value: 12, label: "ธ.ค." },
] as const;
