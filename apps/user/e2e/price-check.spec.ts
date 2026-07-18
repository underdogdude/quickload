import { expect, test, type Page } from "@playwright/test";
import { loginAsTestUser, mockMe, mockSendAccessAllowed, setupE2EPage } from "./helpers";

const ORIGIN = {
  tambon: "บางรัก",
  amphoe: "บางรัก",
  province: "กรุงเทพมหานคร",
  zipcode: "10500",
};

const REMOTE_DESTINATION = {
  tambon: "ตลาดใหญ่",
  amphoe: "เมืองภูเก็ต",
  province: "ภูเก็ต",
  zipcode: "83000",
};

async function setupPriceCheck(page: Page, pricingStatus = 200) {
  await setupE2EPage(page);
  await mockSendAccessAllowed(page);
  await mockMe(page, { firstName: "สมชาย", phone: "0812345678" });
  await page.route("**/api/thai-address?**", async (route) => {
    const q = new URL(route.request().url()).searchParams.get("q");
    const data = q?.includes("83000") ? [REMOTE_DESTINATION] : [ORIGIN];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data }),
    });
  });
  await page.route("**/api/pricing/estimate?**", (route) =>
    route.fulfill({
      status: pricingStatus,
      contentType: "application/json",
      body: JSON.stringify(
        pricingStatus === 200
          ? { ok: true, data: { estimatedTotal: 45 } }
          : { ok: false, error: "ไม่สามารถโหลดตารางราคาได้" },
      ),
    }),
  );

  await loginAsTestUser(page);
  await page.setViewportSize({ width: 390, height: 844 });
}

async function selectLocation(page: Page, inputName: RegExp, query: string, useKeyboard = false) {
  const input = page.getByRole("combobox", { name: inputName });
  await input.fill(query);
  const option = page.getByRole("option").first();
  await expect(option).toBeVisible();
  if (useKeyboard) {
    await input.press("ArrowDown");
    await input.press("Enter");
  } else {
    await option.click();
  }
  await expect(input).toHaveAttribute("readonly", "");
}

async function fillValidParcel(page: Page) {
  await page.getByLabel("น้ำหนัก*").fill("500");
  await page.getByLabel("กว้าง (ซม.)").fill("20");
  await page.getByLabel("ยาว (ซม.)").fill("20");
  await page.getByLabel("สูง (ซม.)").fill("20");
}

test("homepage exposes price check and keeps Help in the footer", async ({ page }) => {
  await setupPriceCheck(page);
  await page.goto("/");

  const priceLink = page.getByRole("link", { name: "เช็กราคา" });
  await expect(priceLink).toHaveAttribute("href", "/price-check");
  await expect(priceLink.locator("img")).toHaveAttribute("src", "/price-check.png");
  await expect(page.getByRole("link", { name: "ช่วยเหลือ" })).toHaveAttribute("href", "/help");
});

test("calculates a remote-area estimate and clears stale results after editing", async ({ page }) => {
  await setupPriceCheck(page);
  await page.goto("/price-check");

  await selectLocation(page, /1\. ต้นทาง/, "10500", true);
  await selectLocation(page, /2\. ปลายทาง/, "83000");
  await fillValidParcel(page);
  await page.getByRole("button", { name: "คำนวณราคา" }).click();

  const result = page.getByRole("region", { name: "ค่าใช้จ่ายโดยประมาณ" });
  await expect(result.getByText("ราคาพื้นฐาน")).toBeVisible();
  await expect(result.getByText("ค่าบริการพื้นที่ห่างไกล")).toBeVisible();
  await expect(result.getByText("45 บาท")).toBeVisible();
  await expect(result.getByText("20 บาท")).toBeVisible();
  await expect(result.getByText("65 บาท")).toBeVisible();
  await expect(result.getByText(/ราคานี้เป็นราคาประมาณ/)).toBeVisible();

  await page.getByLabel("น้ำหนัก*").fill("600");
  await expect(result.getByText("กรอกข้อมูลให้ครบแล้วกดคำนวณราคา")).toBeVisible();
  await expect(result.getByText("65 บาท")).toHaveCount(0);
});

test("shows validation and pricing failures inline", async ({ page }) => {
  await setupPriceCheck(page, 500);
  await page.goto("/price-check");

  await page.getByRole("button", { name: "คำนวณราคา" }).click();
  await expect(page.getByText("กรุณาเลือกต้นทางจากผลการค้นหา")).toBeVisible();
  await expect(page.getByText("กรุณาเลือกปลายทางจากผลการค้นหา")).toBeVisible();
  await expect(page.getByText("กรุณาระบุน้ำหนักพัสดุให้ถูกต้อง")).toBeVisible();
  await expect(page.getByText("กรุณาระบุขนาดพัสดุ (กว้าง/ยาว/สูง) ให้ครบถ้วน")).toBeVisible();

  await selectLocation(page, /1\. ต้นทาง/, "10500");
  await selectLocation(page, /2\. ปลายทาง/, "83000");
  await fillValidParcel(page);
  await page.getByRole("button", { name: "คำนวณราคา" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "ไม่สามารถโหลดตารางราคาได้" })).toBeVisible();
});
