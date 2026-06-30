/**
 * E2E: Send parcel flows
 */

import { test, expect } from "@playwright/test";
import {
  mockMe,
  mockRecipientAddresses,
  mockSenderAddresses,
  mockSendAccessAllowed,
  mockSendAccessBlocked,
  loginAsTestUser,
  setupE2EPage,
} from "./helpers";

async function gotoSendPage(page: import("@playwright/test").Page) {
  await loginAsTestUser(page);
  await mockSendAccessAllowed(page);
  await mockMe(page, {
    firstName: "สมชาย",
    lastName: "ใจดี",
    phone: "0812345678",
  });
  await mockSenderAddresses(page);
  await mockRecipientAddresses(page);

  await page.goto("/send");
  await expect(page.getByRole("heading", { name: "ลงทะเบียนพัสดุ" })).toBeVisible();
}

test("Flow 2: fills /send form and proceeds to review step", async ({ page }) => {
  await setupE2EPage(page);
  await gotoSendPage(page);

  await page.getByPlaceholder("0").fill("500");
  await page.getByPlaceholder("กว้าง(ซม.)").fill("20");
  await page.getByPlaceholder("ยาว(ซม.)").fill("30");
  await page.getByPlaceholder("สูง(ซม.)").fill("10");

  await page.getByPlaceholder("0").blur();

  await expect(page.getByText(/น้ำหนักพัสดุต้องไม่ต่ำกว่า/i)).not.toBeVisible();
  await expect(page.getByText(/ขนาดความกว้าง/i)).not.toBeVisible();
});

test("Flow 3: send is blocked when user has overdue unpaid parcel", async ({ page }) => {
  await setupE2EPage(page);
  await loginAsTestUser(page);
  await mockSendAccessBlocked(page);
  await mockMe(page, {
    firstName: "สมชาย",
    lastName: "ใจดี",
    phone: "0812345678",
  });

  await page.goto("/send");

  await expect(page.getByRole("heading", { name: "ไม่สามารถส่งพัสดุได้" })).toBeVisible();
  await expect(page.getByText(/ค้างชำระเกิน 24 ชม/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "ไปชำระเงิน" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ลงทะเบียนพัสดุ" })).not.toBeVisible();
});

test("Flow 7: weight below minimum shows inline error", async ({ page }) => {
  await setupE2EPage(page);
  await gotoSendPage(page);

  const weightInput = page.getByPlaceholder("0");
  await weightInput.fill("5");
  await weightInput.blur();

  await expect(page.getByText(/น้ำหนักพัสดุต้องไม่ต่ำกว่า 10/i)).toBeVisible({ timeout: 5000 });
});

test("Flow 7: weight above maximum shows inline error", async ({ page }) => {
  await setupE2EPage(page);
  await gotoSendPage(page);

  const weightInput = page.getByPlaceholder("0");
  await weightInput.fill("50000");
  await weightInput.blur();

  await expect(page.getByText(/30 กิโลกรัม/i)).toBeVisible({ timeout: 5000 });
});

test("Flow 7: side dimension exceeding 60cm shows inline error", async ({ page }) => {
  await setupE2EPage(page);
  await gotoSendPage(page);

  const widthInput = page.getByPlaceholder("กว้าง(ซม.)");
  await widthInput.fill("70");
  await widthInput.blur();

  await expect(page.getByText(/ขนาดความกว้าง หรือ ความยาว หรือ ความสูง ห้ามเกิน/i)).toBeVisible({
    timeout: 5000,
  });
});

test("Flow 7: dimension sum exceeding 120cm shows inline error", async ({ page }) => {
  await setupE2EPage(page);
  await gotoSendPage(page);

  await page.getByPlaceholder("กว้าง(ซม.)").fill("50");
  await page.getByPlaceholder("ยาว(ซม.)").fill("50");
  const heightInput = page.getByPlaceholder("สูง(ซม.)");
  await heightInput.fill("50");
  await heightInput.blur();

  await expect(page.getByText(/ผลรวมกว้าง\+ยาว\+สูงห้ามเกิน/i)).toBeVisible({ timeout: 5000 });
});
