import { describe, expect, it } from "vitest";
import {
  BLOCKING_ISHIP_PICKUP_STATUSES,
  buildSystemPickupRemark,
  normalizePickupIdempotencyKey,
  pickupSenderFingerprint,
  pickupStatusLabel,
  toPickupRequestDto,
} from "./iship-pickup";

describe("pickup request helpers", () => {
  it("normalizes and validates idempotency keys", () => {
    expect(normalizePickupIdempotencyKey(" 86a7d748-2054-4f83-bb8e-a3cff79fb2af ")).toBe(
      "86a7d748-2054-4f83-bb8e-a3cff79fb2af",
    );
    expect(normalizePickupIdempotencyKey("short")).toBeNull();
    expect(normalizePickupIdempotencyKey("unsafe key with spaces")).toBeNull();
  });

  it("treats equivalent sender whitespace as the same snapshot", () => {
    const base = {
      contactName: "สมชาย ใจดี",
      phone: "0812345678",
      addressLine: "123 ถนนสุขุมวิท",
      tambon: "คลองเตย",
      amphoe: "คลองเตย",
      province: "กรุงเทพมหานคร",
      zipcode: "10110",
    };
    expect(pickupSenderFingerprint({ ...base, contactName: " สมชาย   ใจดี ", phone: "081-234-5678" })).toBe(
      pickupSenderFingerprint(base),
    );
  });

  it("builds a sanitized barcode remark with customer detail", () => {
    expect(buildSystemPickupRemark(["WB123TH", "TRACK-2"], "โทรก่อนถึง: 5 นาที")).toBe(
      "Barcode WB123TH TRACK-2 โทรก่อนถึง 5 นาที",
    );
  });

  it("permanently blocks picked-up parcels while allowing cancelled or failed retries", () => {
    expect(BLOCKING_ISHIP_PICKUP_STATUSES).toContain("picked_up");
    expect(BLOCKING_ISHIP_PICKUP_STATUSES).toContain("requested");
    expect(BLOCKING_ISHIP_PICKUP_STATUSES).not.toContain("cancelled");
    expect(BLOCKING_ISHIP_PICKUP_STATUSES).not.toContain("failed");
  });

  it("only enables cancellation for requested or assigned rows with a ticket", () => {
    const base = {
      id: "request-1",
      inputSource: "manual",
      contactName: "สมชาย",
      contactPhone: "0812345678",
      pickupAddressFull: "123 กรุงเทพฯ 10110",
      parcelCount: 1,
      heaviestWeightKg: "1.000",
      remark: "",
      status: "requested",
      ishipTicketPickupId: "15315219",
      providerMessage: null,
      staffInfoName: null,
      staffInfoPhone: null,
      timeoutAtText: null,
      ticketMessage: null,
      failureMessage: null,
      acceptedAt: null,
      closedAt: null,
      createdAt: new Date("2026-07-20T00:00:00Z"),
      updatedAt: new Date("2026-07-20T00:00:00Z"),
    };
    expect(toPickupRequestDto(base).canCancel).toBe(true);
    expect(toPickupRequestDto({ ...base, status: "picked_up" }).canCancel).toBe(false);
    expect(toPickupRequestDto({ ...base, ishipTicketPickupId: null }).canCancel).toBe(false);
  });

  it("normalizes and deduplicates recipient names for pickup history", () => {
    const base = {
      id: "request-1",
      inputSource: "system",
      contactName: "สมชาย",
      contactPhone: "0812345678",
      pickupAddressFull: "123 กรุงเทพฯ 10110",
      parcelCount: 3,
      heaviestWeightKg: "1.000",
      remark: "",
      status: "requested",
      ishipTicketPickupId: "15315219",
      providerMessage: null,
      staffInfoName: null,
      staffInfoPhone: null,
      timeoutAtText: null,
      ticketMessage: null,
      failureMessage: null,
      acceptedAt: null,
      closedAt: null,
      createdAt: new Date("2026-07-20T00:00:00Z"),
      updatedAt: new Date("2026-07-20T00:00:00Z"),
    };

    expect(toPickupRequestDto(base, [" สมศรี ใจดี ", "สมศรี ใจดี", null, "มานะ ดีมาก"]).recipientNames).toEqual([
      "สมศรี ใจดี",
      "มานะ ดีมาก",
    ]);
  });

  it("exposes courier lifecycle timestamps for the pickup progress tracker", () => {
    const dto = toPickupRequestDto({
      id: "request-1",
      inputSource: "system",
      contactName: "สมชาย",
      contactPhone: "0812345678",
      pickupAddressFull: "123 กรุงเทพฯ 10110",
      parcelCount: 1,
      heaviestWeightKg: "1.000",
      remark: "",
      status: "picked_up",
      ishipTicketPickupId: "TP20260721001",
      providerMessage: null,
      staffInfoName: "สมชาย ใจดี",
      staffInfoPhone: "0819876543",
      timeoutAtText: null,
      ticketMessage: null,
      failureMessage: null,
      acceptedAt: new Date("2026-07-21T03:30:00Z"),
      closedAt: new Date("2026-07-21T05:30:00Z"),
      createdAt: new Date("2026-07-21T03:00:00Z"),
      updatedAt: new Date("2026-07-21T05:30:00Z"),
    });

    expect(dto.acceptedAt).toBe("2026-07-21T03:30:00.000Z");
    expect(dto.closedAt).toBe("2026-07-21T05:30:00.000Z");
  });

  it("removes the provider brand from every customer-facing message", () => {
    const dto = toPickupRequestDto({
      id: "request-1",
      inputSource: "manual",
      contactName: "สมชาย",
      contactPhone: "0812345678",
      pickupAddressFull: "123 กรุงเทพฯ 10110",
      parcelCount: 1,
      heaviestWeightKg: "1.000",
      remark: "",
      status: "unknown",
      ishipTicketPickupId: "15315219",
      providerMessage: "iShip รับคำขอแล้ว",
      staffInfoName: null,
      staffInfoPhone: null,
      timeoutAtText: null,
      ticketMessage: "ตรวจสอบกับ ISHIP อีกครั้ง",
      failureMessage: "เชื่อมต่อ i ship ไม่สำเร็จ",
      acceptedAt: null,
      closedAt: null,
      createdAt: new Date("2026-07-20T00:00:00Z"),
      updatedAt: new Date("2026-07-20T00:00:00Z"),
    });

    expect(dto.providerMessage).toBe("ผู้ให้บริการ รับคำขอแล้ว");
    expect(dto.ticketMessage).toBe("ตรวจสอบกับ ผู้ให้บริการ อีกครั้ง");
    expect(dto.failureMessage).toBe("เชื่อมต่อ ผู้ให้บริการ ไม่สำเร็จ");
    expect(JSON.stringify(dto)).not.toMatch(/i\s*ship/i);
    expect(pickupStatusLabel("unknown")).toBe("กำลังตรวจสอบสถานะ");
  });
});
