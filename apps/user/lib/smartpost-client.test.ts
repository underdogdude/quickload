import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  requestSmartpostAddItem,
  SmartpostTransportError,
} from "./smartpost-client";

beforeEach(() => {
  vi.stubEnv("SMARTPOST_BASIC_AUTH_USERNAME", "test-user");
  vi.stubEnv("SMARTPOST_BASIC_AUTH_PASSWORD", "test-password");
  vi.stubEnv("SMARTPOST_API_BASE_URL", "https://smartpost.example/");
});

afterEach(() => vi.unstubAllEnvs());

describe("requestSmartpostAddItem", () => {
  it.each(["WA123456789TH", "WB123456789TH", "JB123456789TH", "ZX-FUTURE-1"])(
    "accepts an opaque %s carrier barcode",
    async (barcode) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            statuscode: "201",
            message: "Create successful",
            data: { barcode: barcode.toLowerCase(), smartpost_trackingcode: "NO48-REFERENCE" },
          }),
          { status: 201 },
        ),
      );

      const result = await requestSmartpostAddItem({ referenceId: "QL-1" }, { fetcher });
      expect(result.kind).toBe("accepted");
      if (result.kind === "accepted") expect(result.fields.barcode).toBe(barcode);
    },
  );

  it("rejects HTTP errors even if the body claims statuscode 201", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ statuscode: "201", message: "contradiction" }), { status: 500 }),
    );
    const result = await requestSmartpostAddItem({}, { fetcher });
    expect(result.kind).toBe("rejected");
    if (result.kind === "rejected") expect(result.ambiguous).toBe(true);
  });

  it("allows an explicit rate-limit rejection to be retried with the same reference", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ statuscode: "429", message: "rate limited" }), { status: 429 }),
    );
    const result = await requestSmartpostAddItem({}, { fetcher });
    expect(result.kind).toBe("rejected");
    if (result.kind === "rejected") expect(result.ambiguous).toBe(false);
  });

  it("normalizes array-wrapped accepted responses", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify([
          { statuscode: "201", data: { barcode: "WB123456789TH" } },
        ]),
        { status: 201 },
      ),
    );
    const result = await requestSmartpostAddItem({}, { fetcher });
    expect(result.kind).toBe("accepted");
    if (result.kind === "accepted") expect(result.fields.barcode).toBe("WB123456789TH");
  });

  it("recognizes an HTTP 200 gateway envelope with nested statuscode 201", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            statuscode: "201",
            message: "OK",
            data: { barcode: "WA123456789TH" },
          },
        }),
        { status: 200 },
      ),
    );
    const result = await requestSmartpostAddItem({}, { fetcher });
    expect(result.kind).toBe("accepted");
    if (result.kind === "accepted") expect(result.fields.barcode).toBe("WA123456789TH");
  });

  it("marks transport failure as ambiguous so callers never retry blindly", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("connection reset"));
    await expect(requestSmartpostAddItem({}, { fetcher })).rejects.toEqual(
      expect.objectContaining<Partial<SmartpostTransportError>>({ ambiguous: true, timedOut: false }),
    );
  });
});
