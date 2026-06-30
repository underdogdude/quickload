import type { Page, Route } from "@playwright/test";

/** Block LINE/LIFF external redirects that hijack the browser during E2E. */
export async function blockExternalLineRequests(page: Page) {
  await page.route(/\.line\.me|line-scdn\.net|liffsdk\.line-scdn\.net/, (route) => route.abort());
}

/** Use glob patterns so mocks match full URLs (Playwright requirement). */
function apiRoute(page: Page, pattern: string, handler: (route: Route) => Promise<void> | void) {
  return page.route(`**${pattern}`, handler);
}

export type MeProfile = {
  id?: string;
  lineUserId?: string;
  displayName?: string | null;
  pictureUrl?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  birthDate?: string | null;
};

export async function mockMe(page: Page, profile: MeProfile, patchResponse?: MeProfile) {
  await apiRoute(page, "/api/me", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            id: "user-1",
            lineUserId: "line-1",
            displayName: "Test User",
            pictureUrl: null,
            firstName: null,
            lastName: null,
            phone: null,
            email: null,
            birthDate: null,
            ...profile,
          },
        }),
      });
    }
    if (route.request().method() === "PATCH") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            id: "user-1",
            lineUserId: "line-1",
            firstName: "สมชาย",
            lastName: "ใจดี",
            phone: "0812345678",
            email: "test@example.com",
            birthDate: "1990-01-01",
            ...patchResponse,
          },
        }),
      });
    }
    return route.continue();
  });
}

export async function mockOtpRequest(page: Page, { failWith }: { failWith?: string } = {}) {
  await apiRoute(page, "/api/auth/otp/request", (route) => {
    if (failWith) {
      return route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: failWith }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
}

export async function mockOtpVerify(page: Page, { correctPin = "123456" }: { correctPin?: string } = {}) {
  await apiRoute(page, "/api/auth/otp/verify", async (route) => {
    const body = route.request().postDataJSON() as { pin?: string };
    if (body.pin === correctPin) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    }
    return route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: "รหัส OTP ไม่ถูกต้อง" }),
    });
  });
}

export async function mockSenderAddresses(page: Page) {
  await apiRoute(page, "/api/sender-addresses", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: [
          {
            id: "sender-1",
            contactName: "สมชาย ใจดี",
            phone: "0812345678",
            addressLine: "123 ถนนพระราม 9",
            tambon: "ห้วยขวาง",
            amphoe: "ห้วยขวาง",
            province: "กรุงเทพมหานคร",
            zipcode: "10310",
          },
        ],
      }),
    }),
  );
}

export async function mockRecipientAddresses(page: Page) {
  await apiRoute(page, "/api/recipient-addresses", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: [
          {
            id: "recipient-1",
            contactName: "สมหญิง รักดี",
            phone: "0987654321",
            addressLine: "456 ถนนสุขุมวิท",
            tambon: "คลองเตย",
            amphoe: "คลองเตย",
            province: "กรุงเทพมหานคร",
            zipcode: "10110",
          },
        ],
      }),
    }),
  );
}

export const E2E_PARCEL_ID = "parcel-uuid-001";
export const E2E_PAYMENT_ID = "payment-uuid-001";
export const E2E_QR_PAYLOAD = "00020101021229370016A000000677010111011300668123456785802TH53037645403500354035.005802TH6304ABCD";

export const E2E_PROMPTPAY_CHARGE = {
  paymentId: E2E_PAYMENT_ID,
  status: "pending" as const,
  amount: "35.00",
  currency: "THB",
  paymentMethod: "promptpay",
  qrPayload: E2E_QR_PAYLOAD,
  redirectUrl: null,
  actionRequired: "ENCODED_IMAGE" as const,
  expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  paidAt: null,
  parcelId: E2E_PARCEL_ID,
  barcode: "TH001234567890",
  trackingId: "SP001234",
  outstanding: { state: "unpaid" as const, totalOwed: 35, outstanding: 35 },
};

/** Mock the full single-parcel pay page API sequence. */
export async function mockSingleParcelPayment(page: Page) {
  await apiRoute(page, "/api/payment/charges?parcelId=*", (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { needsCharge: true } }),
    });
  });

  await apiRoute(page, "/api/payment/charges", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          paymentId: E2E_PAYMENT_ID,
          status: "pending",
          amount: "35.00",
          currency: "THB",
          paymentMethod: "promptpay",
          qrPayload: E2E_QR_PAYLOAD,
          redirectUrl: null,
          actionRequired: "ENCODED_IMAGE",
          expiresAt: E2E_PROMPTPAY_CHARGE.expiresAt,
        },
      }),
    });
  });

  await apiRoute(page, `/api/payment/charges/${E2E_PAYMENT_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: E2E_PROMPTPAY_CHARGE }),
    }),
  );
}

/** Standard E2E page setup: block LINE redirects + optional API mocks. */
export async function setupE2EPage(page: Page) {
  await blockExternalLineRequests(page);
}

/** Create iron-session cookie so LoggedInShell + SendAccessProvider render. */
export async function loginAsTestUser(page: Page) {
  const res = await page.request.post("/api/dev/e2e-session");
  if (!res.ok()) {
    throw new Error(`Failed to create E2E session: ${res.status()} ${await res.text()}`);
  }
}

/** Mock send-access check (used by SendAccessProvider). */
export async function mockSendAccessAllowed(page: Page) {
  await apiRoute(page, "/api/send/access", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: { blocked: false, overdueParcelCount: 0, message: null },
      }),
    }),
  );
}

/** Mock overdue unpaid parcel blocking /send. */
export async function mockSendAccessBlocked(page: Page) {
  await apiRoute(page, "/api/send/access", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          blocked: true,
          overdueParcelCount: 1,
          message: "คุณมีพัสดุค้างชำระเกิน 24 ชม. ไม่สามารถทำรายการส่งพัสดุใหม่ได้ กรุณาชำระก่อนส่งพัสดุใหม่",
        },
      }),
    }),
  );
}
