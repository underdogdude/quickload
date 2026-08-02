import { expect, test } from "@playwright/test";
import { loginAsTestUser, mockSendAccessAllowed, setupE2EPage } from "./helpers";

test.beforeEach(async ({ page }) => {
  await setupE2EPage(page);
  await mockSendAccessAllowed(page);
  await loginAsTestUser(page);
});

test("shows the compact header and opens system announcements", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");

  const header = page.getByRole("banner");
  const search = header.getByRole("searchbox", { name: "ค้นหาเลขพัสดุ" });
  const announcementsLink = header.getByRole("link", { name: "ประกาศจากระบบ" });
  const homepageBanner = page.locator("main > section").first();

  await expect(header).toBeVisible();
  await expect(header).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(homepageBanner).toHaveCSS("margin-top", "-84px");
  await expect(homepageBanner).toHaveCSS("background-image", /quickload-banner\.png/);
  await expect(page.getByRole("img", { name: "ส่งง่าย ไวทันใจ กับ Quickload" })).toBeVisible();
  await expect(header.getByText("สวัสดี", { exact: true })).toHaveCount(0);
  await expect(header.getByText("E2E Test User", { exact: true })).toHaveCount(0);
  await expect(header.getByText("บัญชี LINE", { exact: true })).toHaveCount(0);
  await expect(search).toHaveAttribute("placeholder", "ค้นหาเลขพัสดุ");
  await expect(search).toHaveCSS("background-color", "rgba(255, 255, 255, 0.1)");
  await expect(search).toHaveCSS("border-top-width", "0px");
  await expect(announcementsLink).toHaveAttribute("href", "/announcements");

  const [headerBox, searchBox] = await Promise.all([header.boundingBox(), search.boundingBox()]);
  expect(headerBox).not.toBeNull();
  expect(searchBox).not.toBeNull();
  expect(searchBox!.x + searchBox!.width).toBeLessThanOrEqual(headerBox!.x + headerBox!.width);

  await announcementsLink.click();
  await expect(page).toHaveURL(/\/announcements$/);
  await expect(page.getByRole("heading", { name: "ประกาศจากระบบ" })).toBeVisible();
  await expect(page.getByText("ไม่มีประกาศจากระบบ", { exact: true })).toBeVisible();
  await expect(page.locator(".announcements-surface img")).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);

  await page.getByRole("button", { name: "ปิดประกาศจากระบบ" }).click();
  await expect(page).toHaveURL(/\/$/);

  const returnedSearch = page.getByRole("banner").getByRole("searchbox", { name: "ค้นหาเลขพัสดุ" });
  await returnedSearch.fill("TH123456789");
  await returnedSearch.press("Enter");
  await expect(page).toHaveURL(/\/parcels\?q=TH123456789$/);
  await expect(page.getByRole("banner")).toHaveCount(0);

  await page.goto("/price-check");
  await expect(page.getByRole("banner")).toHaveCount(0);
});
