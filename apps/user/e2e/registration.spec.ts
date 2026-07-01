/**
 * E2E: Phone OTP Registration flow
 */

import { test, expect } from "@playwright/test";
import { mockMe, mockOtpRequest, mockOtpVerify, setupE2EPage } from "./helpers";

const PENDING_PROFILE = {
  firstName: "สมชาย",
  lastName: "ใจดี",
  phone: "0812345678",
  email: "test@example.com",
  birthDate: "1990-01-01",
};

function seedPendingProfile(page: import("@playwright/test").Page) {
  return page.addInitScript((profile) => {
    sessionStorage.setItem("quickload_pending_profile", JSON.stringify(profile));
  }, PENDING_PROFILE);
}

test("Flow 1: new user fills register form, verifies phone via OTP, lands on /", async ({ page }) => {
  await setupE2EPage(page);
  await mockMe(page, {});
  await mockOtpRequest(page);
  await mockOtpVerify(page, { correctPin: "123456" });

  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "ยินดีต้อนรับ" })).toBeVisible();

  await page.getByPlaceholder("เช่น สมชาย").fill("สมชาย");
  await page.getByPlaceholder("เช่น ใจดี").fill("ใจดี");
  await page.getByPlaceholder("เช่น 0812345678").fill("0812345678");
  await page.getByPlaceholder("name@example.com").fill("test@example.com");
  await page.getByTestId("birth-date-day").selectOption("1");
  await page.getByTestId("birth-date-month").selectOption("1");
  await page.getByTestId("birth-date-year").selectOption("2533");

  await page.getByRole("button", { name: "เริ่มใช้งาน" }).click();

  await page.waitForURL(/\/register\/verify-phone/);
  await expect(page).toHaveURL(/phone=0812345678/);
  await expect(page.getByText(/ส่งรหัส OTP แล้ว/i)).toBeVisible({ timeout: 10_000 });

  const otpInputs = page.locator('input[inputmode="numeric"][maxlength="1"]');
  await expect(otpInputs).toHaveCount(6);
  for (let i = 0; i < 6; i++) {
    await otpInputs.nth(i).fill("123456"[i]);
  }

  await expect(page.getByText(/ยืนยันเบอร์โทรสำเร็จ/i)).toBeVisible({ timeout: 10_000 });
});

test("verify-phone shows error when pending profile is missing from sessionStorage", async ({ page }) => {
  await setupE2EPage(page);
  await page.goto("/register/verify-phone?phone=0812345678");

  await expect(page.getByRole("heading", { name: "ยืนยันเบอร์โทร" })).toBeVisible();
  await expect(page.getByText(/ไม่พบข้อมูลที่รอการยืนยัน/i)).toBeVisible({ timeout: 10_000 });
});

test("verify-phone shows error when OTP request fails", async ({ page }) => {
  await setupE2EPage(page);
  await seedPendingProfile(page);
  await mockOtpRequest(page, { failWith: "Thaibulksms OTP credentials are not configured" });

  await page.goto("/register/verify-phone?phone=0812345678");

  await expect(
    page.getByText(/ส่งรหัส OTP ไม่สำเร็จ|credentials/i),
  ).toBeVisible({ timeout: 10_000 });
});

test("entering wrong OTP PIN shows error message", async ({ page }) => {
  await setupE2EPage(page);
  await seedPendingProfile(page);
  await mockOtpRequest(page);
  await mockOtpVerify(page, { correctPin: "999999" });

  await page.goto("/register/verify-phone?phone=0812345678");

  await expect(page.getByText(/ส่งรหัส OTP แล้ว/i)).toBeVisible({ timeout: 10_000 });

  const otpInputs = page.locator('input[inputmode="numeric"][maxlength="1"]');
  for (let i = 0; i < 6; i++) {
    await otpInputs.nth(i).fill("123456"[i]);
  }

  await expect(page.getByText(/OTP ไม่ถูกต้อง/i)).toBeVisible({ timeout: 10_000 });
});

test("verify-phone with invalid phone in URL shows error", async ({ page }) => {
  await setupE2EPage(page);
  await page.goto("/register/verify-phone?phone=invalid");

  await expect(page.getByText(/ไม่พบเบอร์โทรที่ถูกต้อง/i)).toBeVisible({ timeout: 10_000 });
});
