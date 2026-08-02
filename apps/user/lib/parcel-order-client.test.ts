import { beforeEach, describe, expect, it, vi } from "vitest";
import { createParcelOrder, ParcelOrderClientError } from "./parcel-order-client";

const input = {
  senderId: "sender-1",
  recipientId: "recipient-1",
  shippingMode: "pickup" as const,
  autoPrint: true,
  weightGram: "1000",
  widthCm: "14",
  lengthCm: "20",
  heightCm: "6",
  parcelType: "เอกสาร",
  note: "รับหน้าบ้าน",
  insuredValue: "",
  extraInsurance: false,
};

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  } satisfies Storage);
});

describe("createParcelOrder", () => {
  it("registers with SmartPost, saves the draft, and reports both progress steps", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, data: { trackingNo: "WB1TH" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: true, data: { id: "parcel-1", trackingId: "TRACK-1" } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    const progress = vi.fn();

    await expect(createParcelOrder(input, { fetcher, onProgress: progress })).resolves.toEqual({
      id: "parcel-1",
      trackingId: "TRACK-1",
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/smartpost/add-item");
    expect(fetcher.mock.calls[1]?.[0]).toBe("/api/parcels/draft");
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toMatchObject({
      senderId: "sender-1",
      recipientId: "recipient-1",
      shippingMode: "pickup",
      autoPrint: true,
      smartpostAddItemResponse: { trackingNo: "WB1TH" },
    });
    expect(progress.mock.calls.map(([step]) => step)).toEqual(["registering", "saving"]);
  });

  it("returns a customer-safe error when the provider responds with HTML", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("<!DOCTYPE html><html></html>", {
        status: 502,
        headers: { "Content-Type": "text/html" },
      }),
    );

    await expect(createParcelOrder(input, { fetcher })).rejects.toEqual(
      expect.objectContaining<Partial<ParcelOrderClientError>>({
        name: "ParcelOrderClientError",
        message: "ระบบลงทะเบียนพัสดุยังไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง",
      }),
    );
  });

  it("retries only the local save after SmartPost already accepted the order", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: true, data: { trackingNo: "WB-RETRY-1" } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: false,
            error: "SEND_ACCESS_BLOCKED",
            message: "กรุณาชำระยอดค้างก่อนส่งพัสดุเพิ่ม",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: { id: "parcel-retry-1", trackingId: "TRACK-RETRY-1" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    await expect(createParcelOrder(input, { fetcher })).rejects.toEqual(
      expect.objectContaining({
        message: "กรุณาชำระยอดค้างก่อนส่งพัสดุเพิ่ม",
      }),
    );

    await expect(createParcelOrder(input, { fetcher })).resolves.toEqual({
      id: "parcel-retry-1",
      trackingId: "TRACK-RETRY-1",
    });

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "/api/smartpost/add-item",
      "/api/parcels/draft",
      "/api/parcels/draft",
    ]);
  });

  it("replays the completed parcel when the same page attempt confirms again", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: true, data: { trackingNo: "WB-COMPLETE-1" } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: { id: "parcel-complete-1", trackingId: "TRACK-COMPLETE-1" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    const options = {
      fetcher,
      attemptId: "QL-stable-page-attempt",
    };

    const first = await createParcelOrder(input, options);
    const replayed = await createParcelOrder(input, options);

    expect(replayed).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)),
    ).toMatchObject({
      referenceId: "QL-stable-page-attempt",
    });
  });
});
