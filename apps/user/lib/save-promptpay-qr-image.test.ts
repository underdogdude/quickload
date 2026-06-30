// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { savePromptPayQrImage } from "./save-promptpay-qr-image";

const MOCK_BLOB = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });

/**
 * Build a minimal fetch mock that avoids jsdom's incomplete Blob/stream support.
 * The source code calls res.ok and res.blob() — we satisfy both.
 */
function makeMockFetch(ok = true) {
  const mockResponse = {
    ok,
    blob: vi.fn().mockResolvedValue(MOCK_BLOB),
  };
  return vi.fn().mockResolvedValue(mockResponse);
}

beforeEach(() => {
  // Reset navigator.share state
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: undefined,
  });
  Object.defineProperty(navigator, "canShare", {
    configurable: true,
    value: undefined,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("savePromptPayQrImage", () => {
  it("returns error for empty paymentId", async () => {
    const result = await savePromptPayQrImage("  ");
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toContain("รหัสการชำระเงิน");
  });

  it("returns error when QR endpoint returns non-ok status", async () => {
    global.fetch = makeMockFetch(false);
    const result = await savePromptPayQrImage("payment-abc");
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toContain("QR");
  });

  it("fetches the correct QR endpoint URL", async () => {
    const mockFetch = makeMockFetch();
    global.fetch = mockFetch;

    // Mock download path (no navigator.share)
    const anchor = document.createElement("a");
    vi.spyOn(document, "createElement").mockReturnValue(anchor);
    vi.spyOn(document.body, "appendChild").mockImplementation(() => anchor);
    vi.spyOn(document.body, "removeChild").mockImplementation(() => anchor);
    vi.spyOn(anchor, "click").mockImplementation(() => {});
    global.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock");
    global.URL.revokeObjectURL = vi.fn();

    await savePromptPayQrImage("payment-abc-12345");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/payment/charges/payment-abc-12345/qr.png",
      { cache: "no-store" },
    );
  });

  it("uses navigator.share when available and canShare returns true", async () => {
    global.fetch = makeMockFetch();
    global.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock");

    const mockShare = vi.fn().mockResolvedValue(undefined);
    const mockCanShare = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "share", { configurable: true, value: mockShare });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: mockCanShare });

    const result = await savePromptPayQrImage("pay-001");
    expect(result.ok).toBe(true);
    expect((result as { ok: true; method: string }).method).toBe("share");
    expect(mockShare).toHaveBeenCalledWith(
      expect.objectContaining({ title: "PromptPay QR" }),
    );
  });

  it("treats AbortError from share as success (user cancelled)", async () => {
    global.fetch = makeMockFetch();
    global.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock");

    const abortError = new Error("User cancelled");
    abortError.name = "AbortError";
    const mockShare = vi.fn().mockRejectedValue(abortError);
    const mockCanShare = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "share", { configurable: true, value: mockShare });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: mockCanShare });

    const result = await savePromptPayQrImage("pay-001");
    expect(result.ok).toBe(true);
    expect((result as { ok: true; method: string }).method).toBe("share");
  });

  it("falls back to download when navigator.share is not available", async () => {
    global.fetch = makeMockFetch();
    global.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock");
    global.URL.revokeObjectURL = vi.fn();

    const anchor = { href: "", download: "", rel: "", click: vi.fn(), remove: vi.fn() } as unknown as HTMLAnchorElement;
    vi.spyOn(document, "createElement").mockReturnValue(anchor);
    vi.spyOn(document.body, "appendChild").mockImplementation(() => anchor);

    const result = await savePromptPayQrImage("pay-002");
    expect(result.ok).toBe(true);
    expect((result as { ok: true; method: string }).method).toBe("download");
    expect(anchor.click).toHaveBeenCalled();
  });

  it("falls back to download when canShare returns false", async () => {
    global.fetch = makeMockFetch();
    global.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock");
    global.URL.revokeObjectURL = vi.fn();

    const anchor = { href: "", download: "", rel: "", click: vi.fn(), remove: vi.fn() } as unknown as HTMLAnchorElement;
    vi.spyOn(document, "createElement").mockReturnValue(anchor);
    vi.spyOn(document.body, "appendChild").mockImplementation(() => anchor);

    const mockShare = vi.fn();
    const mockCanShare = vi.fn().mockReturnValue(false); // canShare rejects file type
    Object.defineProperty(navigator, "share", { configurable: true, value: mockShare });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: mockCanShare });

    const result = await savePromptPayQrImage("pay-003");
    expect(result.ok).toBe(true);
    expect((result as { ok: true; method: string }).method).toBe("download");
    expect(mockShare).not.toHaveBeenCalled();
  });

  it("uses first 8 chars of paymentId in filename", async () => {
    global.fetch = makeMockFetch();
    global.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock");
    global.URL.revokeObjectURL = vi.fn();

    let capturedDownload = "";
    const anchor = {
      href: "",
      get download() { return capturedDownload; },
      set download(v) { capturedDownload = v; },
      rel: "",
      click: vi.fn(),
      remove: vi.fn(),
    } as unknown as HTMLAnchorElement;
    vi.spyOn(document, "createElement").mockReturnValue(anchor);
    vi.spyOn(document.body, "appendChild").mockImplementation(() => anchor);

    await savePromptPayQrImage("abcdefgh-ijkl-mnop");
    expect(capturedDownload).toBe("promptpay-qr-abcdefgh.png");
  });
});
