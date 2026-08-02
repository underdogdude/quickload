import { describe, expect, it } from "vitest";
import { pickupLifecycleTemplate } from "../../admin/lib/internal-line-alerts/templates";

describe("pickup LINE lifecycle copy", () => {
  it("renders a successful request with operational details", () => {
    const message = pickupLifecycleTemplate({
      action: "requested",
      source: "quickload",
      pickupRequestId: "pickup-1",
      ticketPickupId: "550BBE",
      contactName: "สมชาย ใจดี",
      contactPhone: "0812345678",
      parcelCount: 2,
      trackingCodes: ["JB164313070TH", "JB164313071TH"],
      pickupAddress: "37/97 นำสมัย ปากเกร็ด นนทบุรี 11120",
      occurredAt: "2026-08-02T12:20:00.000Z",
    });

    expect(message).toContain("🚚 เรียกรถเข้ารับสำเร็จ");
    expect(message).toContain("Ticket: #550BBE");
    expect(message).toContain("จำนวน: 2 ชิ้น");
    expect(message).toContain("JB164313070TH, JB164313071TH");
    expect(message).toContain("สถานะ: รอพนักงานรับงาน");
  });

  it("identifies who cancelled the request", () => {
    const message = pickupLifecycleTemplate({
      action: "cancelled",
      source: "customer",
      pickupRequestId: "pickup-1",
      ticketPickupId: "550BBE",
    });

    expect(message.startsWith("ควย!! 🚫 ยกเลิกการเข้ารับพัสดุ")).toBe(true);
    expect(message).toContain("ยกเลิกโดย: ลูกค้า");
    expect(message).toContain("สถานะ: ยกเลิกสำเร็จ");
  });

  it("includes provider failures and keeps the pickup active", () => {
    const message = pickupLifecycleTemplate({
      action: "cancel_failed",
      source: "provider",
      pickupRequestId: "pickup-1",
      ticketPickupId: "550BBE",
      failureCode: "provider",
      failureMessage: "ยกเลิกไม่สำเร็จ",
    });

    expect(message).toContain("⚠️ ยกเลิกการเข้ารับไม่สำเร็จ");
    expect(message).toContain("จุดที่เกิดปัญหา: ผู้ให้บริการ");
    expect(message).toContain("สาเหตุ: ยกเลิกไม่สำเร็จ");
    expect(message).toContain("สถานะ: คำขอยังมีผลอยู่");
  });
});
