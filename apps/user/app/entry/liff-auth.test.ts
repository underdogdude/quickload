import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LIFF_INIT_TIMEOUT_ERROR,
  cleanEntryRedirectUrl,
  isLiffInitTimeout,
  startLiffInit,
} from "./liff-auth";

describe("LIFF auth helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("times out a hung LIFF init so the UI can leave the loading state", async () => {
    vi.useFakeTimers();
    const liff = {
      init: vi.fn(() => new Promise<void>(() => {})),
    };
    const init = startLiffInit(liff, "test-liff-id", 1000);

    await vi.advanceTimersByTimeAsync(1000);

    await expect(init).rejects.toThrow(LIFF_INIT_TIMEOUT_ERROR);
    expect(isLiffInitTimeout(await init.catch((error: unknown) => error))).toBe(true);
  });

  it("preserves only origin and pathname when starting a fresh LINE login", () => {
    expect(
      cleanEntryRedirectUrl({
        origin: "https://quickload-user.vercel.app",
        pathname: "/entry",
      }),
    ).toBe("https://quickload-user.vercel.app/entry");
  });
});
