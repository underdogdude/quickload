export const PARCEL_TYPE_OPTIONS = [
  "เอกสาร",
  "เสื้อผ้าเครื่องประดับ",
  "เครื่องสำอาง/ความงาม",
  "อุปกรณ์อิเล็กทรอนิค",
  "อาหาร",
  "ผลไม้",
  "เครื่องมือช่าง",
  "สุขภาพ",
  "ต้นไม้",
  "อื่นๆ",
] as const;

export type ParcelTypeOption = (typeof PARCEL_TYPE_OPTIONS)[number];

const REMOTE_AREA_ZIPCODES = new Set([
  "20120", "23170", "81150", "81210", "82160", "83000", "83100", "83110",
  "83120", "83130", "83150", "84140", "84280", "84310", "84320", "84330",
  "84360", "57170", "57180", "57260", "58000", "58110", "58120", "58130",
  "58140", "58150", "63150", "63170", "71180", "71240", "94000", "94110",
  "94120", "94130", "94140", "94150", "94160", "94170", "94180", "94190",
  "94220", "94230", "95000", "95110", "95120", "95130", "95140", "95150",
  "95160", "95170", "96000", "96110", "96120", "96130", "96140", "96150",
  "96160", "96170", "96180", "96190", "96210", "96220", "83001", "94001",
  "95001", "50250", "50310", "50350", "55130", "55220", "57310", "57340",
  "83111",
]);

export function calculateParcelInsuranceFee(productPrice: number): number {
  if (!Number.isFinite(productPrice) || productPrice <= 2_000) return 0;
  return Math.ceil(productPrice / 5_000) * 10 + 25;
}

export function calculateRemoteAreaSurcharge(zipcode: string | null | undefined): number {
  return zipcode && REMOTE_AREA_ZIPCODES.has(zipcode.trim()) ? 20 : 0;
}
