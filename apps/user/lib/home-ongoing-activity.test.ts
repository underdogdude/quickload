import { describe, expect, it } from "vitest";
import {
  buildParcelOngoingActivity,
  buildPickupOngoingActivity,
  selectRecentOngoingActivities,
} from "./home-ongoing-activity";

describe("home ongoing activity", () => {
  it("prioritizes pickup status without exposing provider details", () => {
    const activity = buildPickupOngoingActivity({
      id: "pickup-1",
      createdAt: "2026-07-28T10:00:00.000Z",
      status: "assigned",
      ticketPickupId: "TP20260721001",
      parcelCount: 3,
    });

    expect(activity).toMatchObject({
      href: "/pickup/requests",
      kind: "pickup",
      title: "พนักงานกำลังเข้ารับพัสดุ",
      detail: "3 ชิ้น",
      supportingText: "เลขที่คำขอ TP20260721001",
    });
    expect(JSON.stringify(activity)).not.toMatch(/iShip|THP_eParcel/i);
  });

  it("links an unpaid parcel directly to payment", () => {
    const activity = buildParcelOngoingActivity({
      id: "parcel-1",
      createdAt: "2026-07-28T09:00:00.000Z",
      status: "pending_payment",
      trackingId: "TRACK-1",
      barcode: "WB111111111TH",
      price: "100",
      amountPaid: "25",
    });

    expect(activity).toMatchObject({
      href: "/pay/parcel-1",
      title: "พัสดุรอชำระเงิน",
      detail: "WB111111111TH",
      supportingText: "ยอดชำระ 75.00 บาท",
    });
  });

  it("includes a newly created parcel that is still waiting to be weighed", () => {
    const activity = buildParcelOngoingActivity({
      id: "parcel-2",
      createdAt: "2026-07-28T11:00:00.000Z",
      status: "awaiting_actual_weight",
      trackingId: "TRACK-2",
      barcode: null,
      price: null,
      amountPaid: "0",
    });

    expect(activity).toMatchObject({
      id: "parcel:parcel-2",
      href: "/parcels/parcel-2",
      title: "พัสดุรอชั่งน้ำหนัก",
      detail: "TRACK-2",
      supportingText: "นำส่งที่ไปรษณีย์หรือเรียกรถเข้ารับ",
    });
  });

  it("keeps only the six most recent activities", () => {
    const activities = Array.from({ length: 7 }, (_, index) =>
      buildParcelOngoingActivity({
        id: `parcel-${index + 1}`,
        createdAt: `2026-07-${String(index + 20).padStart(2, "0")}T10:00:00.000Z`,
        status: "in_transit",
        trackingId: `TRACK-${index + 1}`,
        barcode: null,
        price: null,
        amountPaid: "0",
      }),
    );

    const recent = selectRecentOngoingActivities(activities);

    expect(recent).toHaveLength(6);
    expect(recent[0].id).toBe("parcel:parcel-7");
    expect(recent.at(-1)?.id).toBe("parcel:parcel-2");
  });
});
