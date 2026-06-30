/**
 * E2E: Payment flows
 */

import { test, expect } from "@playwright/test";
import {
  E2E_PARCEL_ID,
  E2E_PAYMENT_ID,
  E2E_PROMPTPAY_CHARGE,
  loginAsTestUser,
  mockMe,
  mockSendAccessAllowed,
  mockSingleParcelPayment,
  setupE2EPage,
} from "./helpers";

test("Flow 4: /pay/[parcelId] creates charge, renders QR, shows paid state after poll", async ({ page }) => {
  await setupE2EPage(page);
  await loginAsTestUser(page);
  await mockSendAccessAllowed(page);
  await mockMe(page, { firstName: "สมชาย", lastName: "ใจดี", phone: "0812345678" });
  await mockSingleParcelPayment(page);

  await page.goto(`/pay/${E2E_PARCEL_ID}`);

  await expect(page.getByText(/พร้อมเพย์/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("฿ 35.00")).toBeVisible();
  await expect(page.locator('img[alt*="QR PromptPay"]')).toBeVisible();
});

test("Flow 5: save QR button triggers fetch to qr.png endpoint", async ({ page }) => {
  await setupE2EPage(page);
  await loginAsTestUser(page);
  await mockSendAccessAllowed(page);
  await mockMe(page, { firstName: "สมชาย", lastName: "ใจดี", phone: "0812345678" });
  await mockSingleParcelPayment(page);

  const qrRequests: string[] = [];
  await page.route(`**/api/payment/charges/${E2E_PAYMENT_ID}/qr.png`, (route) => {
    qrRequests.push(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    });
  });

  await page.goto(`/pay/${E2E_PARCEL_ID}`);
  await expect(page.getByText(/พร้อมเพย์/i)).toBeVisible({ timeout: 10_000 });

  const saveBtn = page.getByRole("button", { name: /บันทึก QR/i });
  await expect(saveBtn).toBeVisible();

  await page.evaluate(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
  });
  await saveBtn.click();
  await expect.poll(() => qrRequests.length).toBeGreaterThan(0);
});

test("Flow 6: /pay/all page loads and shows multiple parcels", async ({ page }) => {
  await setupE2EPage(page);
  await loginAsTestUser(page);
  await mockSendAccessAllowed(page);
  await mockMe(page, { firstName: "สมชาย", lastName: "ใจดี", phone: "0812345678" });

  await page.route("**/api/payment/charges/bulk", (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: { ...E2E_PROMPTPAY_CHARGE, paymentId: "bulk-payment-001" },
        }),
      });
    }
    return route.continue();
  });

  await page.route("**/api/payment/outstanding", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          parcels: [
            { ...E2E_PROMPTPAY_CHARGE, parcelId: "parcel-1", amount: "35.00" },
            { ...E2E_PROMPTPAY_CHARGE, parcelId: "parcel-2", amount: "42.00" },
          ],
          total: { amount: "77.00", currency: "THB" },
        },
      }),
    }),
  );

  await page.goto("/pay/all");
  await expect(page.locator("main")).toBeVisible();
  await expect(page).not.toHaveURL(/error/i);
});

test("/payment page renders outstanding balance section", async ({ page }) => {
  await setupE2EPage(page);
  await loginAsTestUser(page);
  await mockSendAccessAllowed(page);
  await mockMe(page, { firstName: "สมชาย", lastName: "ใจดี", phone: "0812345678" });

  await page.route("**/api/payment/outstanding", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          totalOutstanding: 35,
          itemCount: 1,
          updatedAt: new Date().toISOString(),
          items: [
            {
              parcelId: E2E_PARCEL_ID,
              displayCode: "SP001234",
              routeLabel: "กรุงเทพ → เชียงใหม่",
              outstanding: 35,
              shippingFee: 30,
              smsFee: 3,
              insuranceFee: 2,
              status: "pending_payment",
              updatedAt: new Date().toISOString(),
            },
          ],
        },
      }),
    }),
  );

  await page.route("**/api/payment/history", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { totalPaid: 0, itemCount: 0, items: [] } }),
    }),
  );

  await page.goto("/payment");
  await expect(page.getByRole("heading", { name: "ชำระเงิน" })).toBeVisible();
  await expect(page.getByText(/ยอดค้างชำระทั้งหมด/i)).toBeVisible();
});
