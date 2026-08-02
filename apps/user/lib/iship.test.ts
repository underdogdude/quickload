import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildIshipRequestCourierPayload,
  cancelIshipCourier,
  formatIshipPickupAddress,
  ISHIP_PICKUP_COURIER_CODE,
  normalizeIshipPhone,
  parseIshipWebhookDateTime,
  requestIshipCourier,
  resolveIshipWebhookLifecycleTimestamps,
  resolveIshipWebhookStatus,
  resolveMonotonicPickupStatus,
  sanitizeIshipRemark,
} from "./iship";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

function setConfig() {
  process.env.ISHIP_BASE_URL = "https://app.iship.cloud";
  process.env.ISHIP_BEARER_TOKEN = "test-secret";
}

describe("iShip pickup payload", () => {
  it("normalizes phone, address, and remark without Flash-only fields", () => {
    expect(normalizeIshipPhone("063-446-6202")).toBe("0634466202");
    expect(
      formatIshipPickupAddress({
        addressLine: "52/171 เอกประจิม 2-1",
        tambon: "หลักหก",
        amphoe: "เมืองปทุมธานี",
        province: "ปทุมธานี",
        zipcode: "12000",
      }),
    ).toBe("52/171 เอกประจิม 2-1 ต.หลักหก อ.เมืองปทุมธานี ปทุมธานี 12000");
    expect(sanitizeIshipRemark("  พัสดุ: ขนาดใหญ่...  ")).toBe("พัสดุ ขนาดใหญ่");

    const payload = buildIshipRequestCourierPayload({
      pickupAddress: "123 ถนนสุขุมวิท 10110",
      name: "สมชาย ใจดี",
      phone: "081-234-5678",
      parcelCount: 2,
      remark: "โทรก่อนถึง: 5 นาที",
    });
    expect(payload).toEqual({
      courier_code: "THP_eParcelX",
      pickup_address: "123 ถนนสุขุมวิท 10110",
      name: "สมชาย ใจดี",
      phone: "0812345678",
      parcel: 2,
      remark: "โทรก่อนถึง 5 นาที",
    });
    expect(payload).not.toHaveProperty("flash_staff_info");
  });

  it("always builds Thailand Post pickup requests with eParcel X", () => {
    const payload = buildIshipRequestCourierPayload({
      pickupAddress: "123 ถนนสุขุมวิท 10110",
      name: "สมชาย ใจดี",
      phone: "0812345678",
      parcelCount: 2,
      remark: "พัสดุหนักเกิน 30 กก.",
    });

    expect(ISHIP_PICKUP_COURIER_CODE).toBe("THP_eParcelX");
    expect(payload.courier_code).toBe("THP_eParcelX");
  });
});

describe("iShip upstream client", () => {
  it("parses a successful request and sends Bearer authentication", async () => {
    setConfig();
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          status: true,
          msg: "เรียกรถเข้ารับสำเร็จ",
          data: {
            id: 101,
            ticketPickupId: 15315219,
            staffInfoName: "คุณเอก",
            staffInfoPhone: "0811111111",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const result = await requestIshipCourier(
      {
        courier_code: "THP_eParcelX",
        pickup_address: "123 กรุงเทพฯ 10110",
        name: "สมชาย",
        phone: "0812345678",
        parcel: 1,
        remark: "",
      },
      fetcher as typeof fetch,
    );
    expect(result.ticketPickupId).toBe("15315219");
    expect(result.recordId).toBe("101");
    expect(result.staffInfoName).toBe("คุณเอก");
    expect(fetcher).toHaveBeenCalledOnce();
    const init = fetcher.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-secret");
    expect(init.redirect).toBe("error");
  });

  it("maps the account parcel requirement to an actionable error", async () => {
    setConfig();
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ status: false, msg: "You must create at least 1 parcel first" }), {
        status: 200,
      }),
    );
    await expect(
      requestIshipCourier(
        {
          courier_code: "THP_eParcelX",
          pickup_address: "123 กรุงเทพฯ 10110",
          name: "สมชาย",
          phone: "0812345678",
          parcel: 1,
          remark: "",
        },
        fetcher as typeof fetch,
      ),
    ).rejects.toMatchObject({ code: "order_required", ambiguous: false, httpStatus: 409 });
  });

  it("keeps cancellation as a GET and parses provider success", async () => {
    setConfig();
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ status: true, msg: "ยกเลิกสำเร็จ" })),
    );
    const result = await cancelIshipCourier("15315219", fetcher as typeof fetch);
    expect(result.message).toBe("ยกเลิกสำเร็จ");
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ method: "GET" });
  });
});

describe("iShip webhook lifecycle", () => {
  it("maps common webhook states", () => {
    expect(resolveIshipWebhookStatus("assigned", "พบพนักงานแล้ว")).toBe("assigned");
    expect(resolveIshipWebhookStatus("pickup_success", "เข้ารับสำเร็จ")).toBe("picked_up");
    expect(resolveIshipWebhookStatus("cancelled", "ยกเลิก")).toBe("cancelled");
    expect(resolveIshipWebhookStatus("unrecognized", "อื่นๆ")).toBeNull();
  });

  it("never downgrades assigned or terminal states", () => {
    expect(resolveMonotonicPickupStatus("assigned", "requested")).toBe("assigned");
    expect(resolveMonotonicPickupStatus("picked_up", "cancelled")).toBe("picked_up");
    expect(resolveMonotonicPickupStatus("cancelled", "assigned")).toBe("cancelled");
    expect(resolveMonotonicPickupStatus("requested", "assigned")).toBe("assigned");
  });

  it("interprets timezone-less provider timestamps as Bangkok time", () => {
    expect(parseIshipWebhookDateTime("2025-09-09T10:00:00")?.toISOString()).toBe(
      "2025-09-09T03:00:00.000Z",
    );
    expect(parseIshipWebhookDateTime("2025-09-09 12:30:00")?.toISOString()).toBe(
      "2025-09-09T05:30:00.000Z",
    );
  });

  it("preserves explicit offsets and rejects missing or invalid timestamps", () => {
    expect(parseIshipWebhookDateTime("2025-09-09T10:00:00Z")?.toISOString()).toBe(
      "2025-09-09T10:00:00.000Z",
    );
    expect(parseIshipWebhookDateTime("2025-09-09T10:00:00+07:00")?.toISOString()).toBe(
      "2025-09-09T03:00:00.000Z",
    );
    expect(parseIshipWebhookDateTime("not-a-date")).toBeNull();
    expect(parseIshipWebhookDateTime(null)).toBeNull();
  });

  it("uses provider lifecycle times and falls back only for terminal callbacks", () => {
    const receivedAt = new Date("2025-09-09T06:00:00.000Z");
    expect(
      resolveIshipWebhookLifecycleTimestamps({
        acceptedAt: "2025-09-09T10:00:00",
        closedAt: "2025-09-09T12:30:00",
        currentClosedAt: null,
        nextStatus: "picked_up",
        receivedAt,
      }),
    ).toEqual({
      acceptedAt: new Date("2025-09-09T03:00:00.000Z"),
      closedAt: new Date("2025-09-09T05:30:00.000Z"),
    });

    expect(
      resolveIshipWebhookLifecycleTimestamps({
        acceptedAt: null,
        closedAt: "invalid",
        currentClosedAt: null,
        nextStatus: "cancelled",
        receivedAt,
      }),
    ).toEqual({ closedAt: receivedAt });
    expect(
      resolveIshipWebhookLifecycleTimestamps({
        acceptedAt: null,
        closedAt: null,
        currentClosedAt: new Date("2025-09-09T05:00:00.000Z"),
        nextStatus: "picked_up",
        receivedAt,
      }),
    ).toEqual({});
  });
});
