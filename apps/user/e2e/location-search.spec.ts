/**
 * E2E: Thai location search interaction
 */

import { test, expect, type Page } from "@playwright/test";
import { loginAsTestUser, mockMe, mockSendAccessAllowed, setupE2EPage } from "./helpers";

const LOCATION_ROWS = Array.from({ length: 30 }, (_, index) => ({
  tambon: `บางรัก ${index + 1}`,
  amphoe: "บางรัก",
  province: "กรุงเทพมหานคร",
  zipcode: String(10500 + index),
}));

async function mockThaiAddressSearch(page: Page) {
  await page.route("**/api/thai-address?**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: LOCATION_ROWS }),
    }),
  );
}

async function openAddressForm(page: Page, kind: "sender" | "recipient") {
  await setupE2EPage(page);
  await loginAsTestUser(page);
  await mockSendAccessAllowed(page);
  await mockMe(page, {
    firstName: "สมชาย",
    lastName: "ใจดี",
    phone: "0812345678",
  });
  await mockThaiAddressSearch(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/send/${kind}`);
}

for (const kind of ["sender", "recipient"] as const) {
  test(`${kind} location search scroll gesture does not select a row`, async ({ page }) => {
    await openAddressForm(page, kind);

    const input = page.locator(`#${kind === "sender" ? "sender" : "recipient"}-location-search`);
    await input.fill("บางรัก");

    const list = page.locator(".touch-pan-y").first();
    await expect(list).toBeVisible();
    await expect(page.getByRole("button", { name: /บางรัก 1, บางรัก, กรุงเทพมหานคร, 10500/ })).toBeVisible();

    const firstRow = page.getByRole("button", { name: /บางรัก 1, บางรัก, กรุงเทพมหานคร, 10500/ });
    const box = await firstRow.boundingBox();
    if (!box) throw new Error("Location suggestion row is not measurable");

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(input).toHaveValue("บางรัก");

    await page.mouse.move(box.x + box.width / 2, box.y - 120, { steps: 8 });
    await page.mouse.up();
    await expect(input).toHaveValue("บางรัก");

    await list.hover();
    await page.mouse.wheel(0, 300);
    await expect
      .poll(() => list.evaluate((node) => node.scrollTop))
      .toBeGreaterThan(0);
    await expect(input).toHaveValue("บางรัก");
  });
}
