import type { IshipPickupStatus } from "./iship";
import { sanitizeIshipRemark } from "./iship";

export const MAX_PICKUP_WEIGHT_KG = 30;

// These statuses reserve an attached parcel against another pickup request.
// picked_up remains blocking permanently; cancelled and failed requests may be retried.
export const BLOCKING_ISHIP_PICKUP_STATUSES: IshipPickupStatus[] = [
  "submitting",
  "requested",
  "assigned",
  "picked_up",
  "unknown",
];

export type PickupSenderSnapshot = {
  contactName: string;
  phone: string;
  addressLine: string;
  tambon: string;
  amphoe: string;
  province: string;
  zipcode: string;
};

export type PickupRequestDto = {
  id: string;
  inputSource: "manual" | "system";
  contactName: string;
  contactPhone: string;
  recipientNames: string[];
  pickupAddressFull: string;
  parcelCount: number;
  heaviestWeightKg: number;
  remark: string;
  status: IshipPickupStatus;
  ticketPickupId: string | null;
  providerMessage: string | null;
  staffInfoName: string | null;
  staffInfoPhone: string | null;
  timeoutAtText: string | null;
  ticketMessage: string | null;
  failureMessage: string | null;
  canCancel: boolean;
  acceptedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type PickupRowLike = {
  id: string;
  inputSource: string;
  contactName: string;
  contactPhone: string;
  pickupAddressFull: string;
  parcelCount: number;
  heaviestWeightKg: string | number;
  remark: string;
  status: string;
  ishipTicketPickupId: string | null;
  providerMessage: string | null;
  staffInfoName: string | null;
  staffInfoPhone: string | null;
  timeoutAtText: string | null;
  ticketMessage: string | null;
  failureMessage: string | null;
  acceptedAt: Date | string | null;
  closedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

function iso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function nullableIso(value: Date | string | null): string | null {
  return value == null ? null : iso(value);
}

function publicProviderText(value: string | null): string | null {
  return value ? value.replace(/i\s*ship/gi, "ผู้ให้บริการ") : null;
}

export function toPickupRequestDto(
  row: PickupRowLike,
  recipientNames: Array<string | null | undefined> = [],
): PickupRequestDto {
  const status = row.status as IshipPickupStatus;
  return {
    id: row.id,
    inputSource: row.inputSource === "system" ? "system" : "manual",
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    recipientNames: [...new Set(recipientNames.map((name) => name?.trim()).filter((name): name is string => Boolean(name)))],
    pickupAddressFull: row.pickupAddressFull,
    parcelCount: row.parcelCount,
    heaviestWeightKg: Number(row.heaviestWeightKg),
    remark: row.remark,
    status,
    ticketPickupId: row.ishipTicketPickupId,
    providerMessage: publicProviderText(row.providerMessage),
    staffInfoName: row.staffInfoName,
    staffInfoPhone: row.staffInfoPhone,
    timeoutAtText: row.timeoutAtText,
    ticketMessage: publicProviderText(row.ticketMessage),
    failureMessage: publicProviderText(row.failureMessage),
    canCancel: (status === "requested" || status === "assigned") && Boolean(row.ishipTicketPickupId),
    acceptedAt: nullableIso(row.acceptedAt),
    closedAt: nullableIso(row.closedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function normalizePickupIdempotencyKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim();
  if (!/^[A-Za-z0-9:_-]{8,128}$/.test(key)) return null;
  return key;
}

function normalizeFingerprintPart(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("th-TH");
}

export function pickupSenderFingerprint(sender: PickupSenderSnapshot): string {
  return [
    sender.contactName,
    sender.phone.replace(/\D/g, ""),
    sender.addressLine,
    sender.tambon,
    sender.amphoe,
    sender.province,
    sender.zipcode,
  ]
    .map(normalizeFingerprintPart)
    .join("|");
}

export function buildSystemPickupRemark(codes: string[], customerRemark = ""): string {
  const identifiers = codes.map((code) => code.trim()).filter(Boolean);
  const systemPart = identifiers.length ? `Barcode ${identifiers.join(" ")}` : "";
  return sanitizeIshipRemark([systemPart, customerRemark.trim()].filter(Boolean).join(" "));
}

export function pickupStatusLabel(status: IshipPickupStatus): string {
  const labels: Record<IshipPickupStatus, string> = {
    submitting: "กำลังส่งคำขอ",
    requested: "รอไปรษณีย์เข้ารับ",
    assigned: "มีพนักงานรับงานแล้ว",
    picked_up: "เข้ารับพัสดุแล้ว",
    cancelled: "ยกเลิกแล้ว",
    failed: "ส่งคำขอไม่สำเร็จ",
    unknown: "กำลังตรวจสอบสถานะ",
  };
  return labels[status];
}
