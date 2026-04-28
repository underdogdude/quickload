export type ThaiPostStatusCode =
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "11"
  | "12"
  | "13"
  | "14"
  | "15"
  | "16"
  | "17"
  | "18"
  | "19"
  | "20";

export type ParcelFlowStatus =
  | "awaiting_actual_weight"
  | "pending_payment"
  | "paid"
  | "registered"
  | "at_destination_post"
  | "in_transit"
  | "delivered"
  | "returning"
  | "failed"
  | "canceled";

type ThaiPostStatusMeta = {
  code: ThaiPostStatusCode;
  descriptionTh: string;
  parcelStatus: ParcelFlowStatus;
  /** True once branch registration/actual weight should be known and payment can start. */
  unlocksPayment: boolean;
};

export const THAI_POST_STATUS_META: Record<ThaiPostStatusCode, ThaiPostStatusMeta> = {
  "1": {
    code: "1",
    descriptionTh: "ปณ.ต้นทางรับฝากแล้ว",
    parcelStatus: "pending_payment",
    unlocksPayment: true,
  },
  "2": { code: "2", descriptionTh: "นำจ่ายถึงผู้รับแล้ว", parcelStatus: "delivered", unlocksPayment: true },
  "3": { code: "3", descriptionTh: "อยู่ระหว่างคัดแยกสินค้า", parcelStatus: "in_transit", unlocksPayment: true },
  "4": {
    code: "4",
    descriptionTh: "ส่งออกจากศูนย์คัดแยกสินค้า/ที่ทำการ",
    parcelStatus: "in_transit",
    unlocksPayment: true,
  },
  "5": {
    code: "5",
    descriptionTh: "ถึงศูนย์คัดแยกสินค้า/ที่ทำการ",
    parcelStatus: "in_transit",
    unlocksPayment: true,
  },
  "6": {
    code: "6",
    descriptionTh: "ถึง ปณ.ปลายทาง เตรียมนำจ่าย",
    parcelStatus: "at_destination_post",
    unlocksPayment: true,
  },
  "7": { code: "7", descriptionTh: "นำจ่าย/ชำระเงินเรียบร้อย", parcelStatus: "delivered", unlocksPayment: true },
  "8": {
    code: "8",
    descriptionTh: "รอจ่าย ณ ที่ทำการไปรษณีย์",
    parcelStatus: "at_destination_post",
    unlocksPayment: true,
  },
  "9": { code: "9", descriptionTh: "อยู่ในระหว่างการขนส่ง", parcelStatus: "in_transit", unlocksPayment: true },
  "10": { code: "10", descriptionTh: "อยู่ในระหว่างส่งคืน", parcelStatus: "returning", unlocksPayment: true },
  "11": { code: "11", descriptionTh: "สแกนเปิดเพื่อส่งต่อ", parcelStatus: "in_transit", unlocksPayment: true },
  "12": { code: "12", descriptionTh: "สแกนรับเข้าปลายทาง", parcelStatus: "in_transit", unlocksPayment: true },
  "13": { code: "13", descriptionTh: "สแกนรับมอบ", parcelStatus: "in_transit", unlocksPayment: true },
  "14": { code: "14", descriptionTh: "ออกใบแจ้ง", parcelStatus: "at_destination_post", unlocksPayment: true },
  "15": { code: "15", descriptionTh: "จ่าหน้าไม่ชัดเจน", parcelStatus: "failed", unlocksPayment: true },
  "16": { code: "16", descriptionTh: "ไม่มีเลขบ้านตามจ่าหน้า", parcelStatus: "failed", unlocksPayment: true },
  "17": { code: "17", descriptionTh: "ไม่ยอมรับ", parcelStatus: "failed", unlocksPayment: true },
  "18": { code: "18", descriptionTh: "ไม่มีผู้รับตามจ่าหน้า", parcelStatus: "failed", unlocksPayment: true },
  "19": { code: "19", descriptionTh: "ไม่มารับตามกำหนด", parcelStatus: "failed", unlocksPayment: true },
  "20": { code: "20", descriptionTh: "Drop แล้ว", parcelStatus: "canceled", unlocksPayment: true },
};

/**
 * Raw status from the carrier webhook (`status` field). May be outside 1–20 (e.g. "30").
 * Accepts string or finite number from JSON.
 */
export function parseThaiPostStatusCodeRaw(input: unknown): string | null {
  if (typeof input === "number" && Number.isFinite(input)) {
    const s = String(Math.trunc(input));
    return s || null;
  }
  if (typeof input !== "string") return null;
  const code = input.trim();
  return code || null;
}

/**
 * Maps API status to internal 1–20 meta when possible ("03" → "3").
 * Returns null for codes with no row in {@link THAI_POST_STATUS_META} — still persist the raw string on events.
 */
export function resolveThaiPostStatusMetaCode(raw: string): ThaiPostStatusCode | null {
  const trimmed = raw.trim();
  if (Object.hasOwn(THAI_POST_STATUS_META, trimmed)) return trimmed as ThaiPostStatusCode;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  const k = String(Math.trunc(n));
  if (!Object.hasOwn(THAI_POST_STATUS_META, k)) return null;
  return k as ThaiPostStatusCode;
}

/** @returns Internal 1–20 code only; use {@link parseThaiPostStatusCodeRaw} to accept any carrier code. */
export function parseThaiPostStatusCode(input: unknown): ThaiPostStatusCode | null {
  const raw = parseThaiPostStatusCodeRaw(input);
  return raw ? resolveThaiPostStatusMetaCode(raw) : null;
}

export function mapThaiPostStatus(code: ThaiPostStatusCode): ThaiPostStatusMeta {
  return THAI_POST_STATUS_META[code];
}
