/** Max length per side (width / length / height), in cm. */
export const MAX_PARCEL_SIDE_CM = 60;

/** Max sum of width + length + height, in cm. */
export const MAX_PARCEL_DIMENSIONS_SUM_CM = 120;

export type ParcelDimensionsCm = {
  widthCm: number;
  lengthCm: number;
  heightCm: number;
};

export function parsePositiveCm(value: string | number | undefined): number | null {
  if (value === undefined || value === "") return null;
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Returns a Thai error message for one filled side, or `null` when empty/valid. */
export function validateParcelSideCm(value: string): string | null {
  const side = parsePositiveCm(value);
  if (side === null) return null;
  if (side > MAX_PARCEL_SIDE_CM) {
    return "ขนาดความกว้าง หรือ ความยาว หรือ ความสูง ห้ามเกิน 60 ซม.";
  }
  return null;
}

/** Returns a Thai error message, or `null` when valid. */
export function validateParcelDimensionsCm(dimensions: ParcelDimensionsCm): string | null {
  const { widthCm, lengthCm, heightCm } = dimensions;

  if (widthCm > MAX_PARCEL_SIDE_CM || lengthCm > MAX_PARCEL_SIDE_CM || heightCm > MAX_PARCEL_SIDE_CM) {
    return "ขนาดความกว้าง หรือ ความยาว หรือ ความสูง ห้ามเกิน 60 ซม.";
  }

  const sum = widthCm + lengthCm + heightCm;
  if (sum > MAX_PARCEL_DIMENSIONS_SUM_CM) {
    return "ผลรวมกว้าง+ยาว+สูงห้ามเกิน 120 ซม.";
  }

  return null;
}

/** Returns a Thai error message, or `null` when valid. */
export function validateParcelDimensionsFromStrings(
  widthCm: string,
  lengthCm: string,
  heightCm: string,
): string | null {
  const width = parsePositiveCm(widthCm);
  const length = parsePositiveCm(lengthCm);
  const height = parsePositiveCm(heightCm);

  if (width === null || length === null || height === null) {
    return "กรุณาระบุขนาดพัสดุ (กว้าง/ยาว/สูง) ให้ครบถ้วน";
  }

  return validateParcelDimensionsCm({ widthCm: width, lengthCm: length, heightCm: height });
}

export const MIN_PARCEL_WEIGHT_GRAM = 10;
export const MAX_PARCEL_WEIGHT_GRAM = 30_000;

/** Returns a Thai error message, or `null` when valid. */
export function validateWeightGram(
  weightGram: string,
  minGram = MIN_PARCEL_WEIGHT_GRAM,
  maxGram = MAX_PARCEL_WEIGHT_GRAM,
): string | null {
  const n = Number(weightGram);
  if (!weightGram || !Number.isFinite(n) || n <= 0) {
    return "กรุณาระบุน้ำหนักพัสดุให้ถูกต้อง";
  }
  if (n < minGram) {
    return `น้ำหนักพัสดุต้องไม่ต่ำกว่า ${minGram} กรัม`;
  }
  if (n > maxGram) {
    return "น้ำหนักพัสดุต้องไม่เกิน 30 กิโลกรัม หรือ 30,000 กรัม";
  }
  return null;
}
