import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { toThaibulkMsisdn, requestThaibulkOtp, verifyThaibulkOtp, ThaibulkOtpError } from "./thaibulksms-otp";

// ---------------------------------------------------------------------------
// MSW server — intercepts real fetch calls in Node
// ---------------------------------------------------------------------------

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// toThaibulkMsisdn — pure function, no I/O
// ---------------------------------------------------------------------------

describe("toThaibulkMsisdn", () => {
  it("converts local 0xxxxxxxxx to 66xxxxxxxxx", () => {
    expect(toThaibulkMsisdn("0812345678")).toBe("66812345678");
  });

  it("keeps already-prefixed 66xxxxxxxxx unchanged", () => {
    expect(toThaibulkMsisdn("66812345678")).toBe("66812345678");
  });

  it("strips +66 prefix and converts", () => {
    expect(toThaibulkMsisdn("+66812345678")).toBe("66812345678");
  });

  it("handles number with spaces (normalizeThaiPhone strips spaces first)", () => {
    expect(toThaibulkMsisdn("081 234 5678")).toBe("66812345678");
  });

  it("handles number with hyphens", () => {
    expect(toThaibulkMsisdn("081-234-5678")).toBe("66812345678");
  });

  it("handles Bangkok landline 02xxxxxxxx", () => {
    expect(toThaibulkMsisdn("021234567")).toBe("6621234567");
  });
});

// ---------------------------------------------------------------------------
// requestThaibulkOtp — calls Thaibulksms OTP API
// ---------------------------------------------------------------------------

describe("requestThaibulkOtp", () => {
  it("throws ThaibulkOtpError when API credentials are missing", async () => {
    const originalKey = process.env.THAIBULKSMS_OTP_API_KEY;
    const originalSecret = process.env.THAIBULKSMS_OTP_API_SECRET;
    delete process.env.THAIBULKSMS_OTP_API_KEY;
    delete process.env.THAIBULKSMS_OTP_API_SECRET;

    await expect(requestThaibulkOtp("0812345678")).rejects.toThrowError(ThaibulkOtpError);

    process.env.THAIBULKSMS_OTP_API_KEY = originalKey;
    process.env.THAIBULKSMS_OTP_API_SECRET = originalSecret;
  });

  it("returns token on successful API response", async () => {
    process.env.THAIBULKSMS_OTP_API_KEY = "test-key";
    process.env.THAIBULKSMS_OTP_API_SECRET = "test-secret";

    server.use(
      http.post("https://otp.thaibulksms.com/v1/otp/request", () =>
        HttpResponse.json({ data: { token: "abc-token-123" } }, { status: 200 }),
      ),
    );

    const result = await requestThaibulkOtp("0812345678");
    expect(result.token).toBe("abc-token-123");
  });

  it("throws ThaibulkOtpError when API returns non-ok status", async () => {
    process.env.THAIBULKSMS_OTP_API_KEY = "test-key";
    process.env.THAIBULKSMS_OTP_API_SECRET = "test-secret";

    server.use(
      http.post("https://otp.thaibulksms.com/v1/otp/request", () =>
        HttpResponse.json(
          { error: { errors: ["Phone number is invalid"] } },
          { status: 400 },
        ),
      ),
    );

    await expect(requestThaibulkOtp("0812345678")).rejects.toThrowError("Phone number is invalid");
  });

  it("throws ThaibulkOtpError with fallback message when error body is unparseable", async () => {
    process.env.THAIBULKSMS_OTP_API_KEY = "test-key";
    process.env.THAIBULKSMS_OTP_API_SECRET = "test-secret";

    server.use(
      http.post("https://otp.thaibulksms.com/v1/otp/request", () =>
        new HttpResponse("Internal Server Error", { status: 500 }),
      ),
    );

    await expect(requestThaibulkOtp("0812345678")).rejects.toThrowError(ThaibulkOtpError);
  });

  it("throws ThaibulkOtpError when response has no token in data", async () => {
    process.env.THAIBULKSMS_OTP_API_KEY = "test-key";
    process.env.THAIBULKSMS_OTP_API_SECRET = "test-secret";

    server.use(
      http.post("https://otp.thaibulksms.com/v1/otp/request", () =>
        HttpResponse.json({ data: {} }, { status: 200 }),
      ),
    );

    await expect(requestThaibulkOtp("0812345678")).rejects.toThrowError(ThaibulkOtpError);
  });

  it("extracts error message from error.errors array with message object", async () => {
    process.env.THAIBULKSMS_OTP_API_KEY = "test-key";
    process.env.THAIBULKSMS_OTP_API_SECRET = "test-secret";

    server.use(
      http.post("https://otp.thaibulksms.com/v1/otp/request", () =>
        HttpResponse.json(
          { error: { errors: [{ message: "Rate limit exceeded" }] } },
          { status: 429 },
        ),
      ),
    );

    await expect(requestThaibulkOtp("0812345678")).rejects.toThrowError("Rate limit exceeded");
  });

  it("extracts top-level message when error.errors is absent", async () => {
    process.env.THAIBULKSMS_OTP_API_KEY = "test-key";
    process.env.THAIBULKSMS_OTP_API_SECRET = "test-secret";

    server.use(
      http.post("https://otp.thaibulksms.com/v1/otp/request", () =>
        HttpResponse.json({ message: "Service unavailable" }, { status: 503 }),
      ),
    );

    await expect(requestThaibulkOtp("0812345678")).rejects.toThrowError("Service unavailable");
  });
});

// ---------------------------------------------------------------------------
// verifyThaibulkOtp — calls Thaibulksms verify API
// ---------------------------------------------------------------------------

describe("verifyThaibulkOtp", () => {
  it("resolves when API returns ok status", async () => {
    process.env.THAIBULKSMS_OTP_API_KEY = "test-key";
    process.env.THAIBULKSMS_OTP_API_SECRET = "test-secret";

    server.use(
      http.post("https://otp.thaibulksms.com/v1/otp/verify", () =>
        HttpResponse.json({ status: "success" }, { status: 200 }),
      ),
    );

    await expect(verifyThaibulkOtp("token-abc", "123456")).resolves.toBeUndefined();
  });

  it("throws ThaibulkOtpError on wrong PIN (400)", async () => {
    process.env.THAIBULKSMS_OTP_API_KEY = "test-key";
    process.env.THAIBULKSMS_OTP_API_SECRET = "test-secret";

    server.use(
      http.post("https://otp.thaibulksms.com/v1/otp/verify", () =>
        HttpResponse.json({ message: "PIN is incorrect" }, { status: 400 }),
      ),
    );

    await expect(verifyThaibulkOtp("token-abc", "999999")).rejects.toThrowError("PIN is incorrect");
  });

  it("throws ThaibulkOtpError with fallback message on unparseable error body", async () => {
    process.env.THAIBULKSMS_OTP_API_KEY = "test-key";
    process.env.THAIBULKSMS_OTP_API_SECRET = "test-secret";

    server.use(
      http.post("https://otp.thaibulksms.com/v1/otp/verify", () =>
        new HttpResponse("Bad Gateway", { status: 502 }),
      ),
    );

    await expect(verifyThaibulkOtp("token-abc", "123456")).rejects.toThrowError(ThaibulkOtpError);
  });

  it("throws ThaibulkOtpError when credentials missing", async () => {
    const originalKey = process.env.THAIBULKSMS_OTP_API_KEY;
    const originalSecret = process.env.THAIBULKSMS_OTP_API_SECRET;
    delete process.env.THAIBULKSMS_OTP_API_KEY;
    delete process.env.THAIBULKSMS_OTP_API_SECRET;

    await expect(verifyThaibulkOtp("token", "123456")).rejects.toThrowError(ThaibulkOtpError);

    process.env.THAIBULKSMS_OTP_API_KEY = originalKey;
    process.env.THAIBULKSMS_OTP_API_SECRET = originalSecret;
  });
});
