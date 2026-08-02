import { expect, test } from "@playwright/test";
import {
  loginAsTestUser,
  mockMe,
  mockSendAccessAllowed,
  setupE2EPage,
} from "./helpers";

const PROFILE_STATS = {
  parcelsTotal: 12,
  pickupRequests: 3,
  paymentsSucceeded: 8,
  paymentsPending: 2,
};

async function mockProfileStats(page: import("@playwright/test").Page) {
  await page.route("**/api/profile/stats", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: PROFILE_STATS }),
    }),
  );
}

test.beforeEach(async ({ page }) => {
  await setupE2EPage(page);
  await loginAsTestUser(page);
  await mockSendAccessAllowed(page);
});

test("profile shows member identity, statistics, menus, banners, and LINE links", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await mockProfileStats(page);
  await page.goto("/profile");

  await expect(page.getByRole("heading", { name: "E2E Test User" })).toBeVisible();
  await expect(page.getByAltText("ตราสมาชิก Quickload")).toHaveAttribute(
    "src",
    /q-badge\.png/,
  );
  await expect(page.getByText("0812345678")).toBeVisible();
  await expect(page.getByText("ID: QL-E2EUSER")).toBeVisible();

  await expect(page.getByRole("link", { name: "พัสดุทั้งหมด 12 รายการ" })).toHaveAttribute(
    "href",
    "/parcels",
  );
  await expect(page.getByRole("link", { name: "รถเข้ารับพัสดุ 3 รายการ" })).toHaveAttribute(
    "href",
    "/pickup/requests",
  );
  await expect(page.getByRole("link", { name: "ชำระเงินสำเร็จ 8 รายการ" })).toHaveAttribute(
    "href",
    "/payment?tab=history",
  );
  await expect(page.getByRole("link", { name: "รอชำระเงิน 2 รายการ" })).toHaveAttribute(
    "href",
    "/payment",
  );

  await expect(page.getByRole("link", { name: /ข้อมูลส่วนตัว/ })).toHaveAttribute(
    "href",
    "/profile/edit",
  );
  await expect(page.getByRole("link", { name: /สมุดที่อยู่ของฉัน/ })).toHaveAttribute(
    "href",
    "/addresses",
  );
  await expect(page.getByRole("link", { name: /ข้อมูลการเรียกเก็บเงินของฉัน/ })).toHaveAttribute(
    "href",
    "/payment",
  );

  await expect(page.getByRole("link", { name: "แชตกับ Quickload ทาง LINE" })).toHaveAttribute(
    "href",
    "https://lin.ee/6c3gPxZ",
  );
  await expect(page.getByRole("link", { name: "ส่งข้อเสนอแนะ" })).toHaveAttribute(
    "href",
    "https://lin.ee/6c3gPxZ",
  );
  await expect(page.locator('a[href="/pickup"]')).not.toHaveCount(0);
  await expect(page.locator('a[href="/send"]')).not.toHaveCount(0);
  await expect(page.locator('a[href="/price-check"]')).not.toHaveCount(0);
  await expect(page.locator(".profile-banner-carousel .swiper-pagination")).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
});

test("profile statistics expose failure and recover through retry", async ({ page }) => {
  let recover = false;
  await page.route("**/api/profile/stats", (route) => {
    if (!recover) {
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: "temporary" }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: PROFILE_STATS }),
    });
  });

  await page.goto("/profile");
  await expect(page.getByText("ไม่สามารถโหลดสถิติได้")).toBeVisible();
  recover = true;
  await page.getByRole("button", { name: "ลองอีกครั้ง" }).click();
  await expect(page.getByRole("link", { name: "พัสดุทั้งหมด 12 รายการ" })).toBeVisible();
});

test("completed members visiting register are redirected to profile", async ({ page }) => {
  await mockProfileStats(page);
  await page.goto("/register");
  await expect(page).toHaveURL(/\/profile$/);
});

test("profile edit sends changed phone to its dedicated OTP route", async ({ page }) => {
  await mockMe(page, {
    displayName: "E2E Test User",
    firstName: "สมชาย",
    lastName: "ใจดี",
    phone: "0812345678",
  });

  await page.goto("/profile/edit");
  await page.getByPlaceholder("เช่น 0812345678").fill("0891234567");
  await page.getByRole("button", { name: "บันทึกข้อมูล" }).click();

  await expect(page).toHaveURL(/\/profile\/edit\/verify-phone\?phone=0891234567/);
});
