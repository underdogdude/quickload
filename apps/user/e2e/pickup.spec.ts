import { expect, test, type Page, type Route } from "@playwright/test";
import { loginAsTestUser, mockSendAccessAllowed } from "./helpers";

const sender = {
  contactName: "สมชาย ใจดี",
  phone: "0812345678",
  addressLine: "123 ถนนสุขุมวิท",
  tambon: "คลองเตย",
  amphoe: "คลองเตย",
  province: "กรุงเทพมหานคร",
  zipcode: "10110",
};

const senderAddress = {
  id: "sender-address-1",
  userId: "user-1",
  ...sender,
  isPrimary: true,
  createdAt: "2026-07-20T00:00:00.000Z",
  updatedAt: null,
};

const recipient = {
  id: "recipient-1",
  userId: "user-1",
  contactName: "สมศรี ใจดี",
  phone: "0891112222",
  addressLine: "88/9 ถนนสุขุมวิท",
  tambon: "พระโขนงเหนือ",
  amphoe: "วัฒนา",
  province: "กรุงเทพมหานคร",
  zipcode: "10110",
  isPrimary: true,
  createdAt: "2026-07-20T00:00:00.000Z",
  updatedAt: null,
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function mockPickupApis(
  page: Page,
  historyItems: unknown[] = [],
  eligibleItems?: unknown[],
  pickupParcelCounts?: {
    activePickupParcelCount?: number;
    unavailablePickupParcelCount?: number;
  },
) {
  await page.route("**/api/sender-addresses**", async (route) => {
    return json(route, { ok: true, data: [senderAddress] });
  });
  await page.route("**/api/pickup**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/eligible-parcels")) {
      return json(route, {
        ok: true,
        data: {
          items: eligibleItems ?? [
            {
              id: "parcel-1",
              trackingId: "TRACK-1",
              barcode: "WB111111111TH",
              displayCode: "WB111111111TH",
              weightKg: 1.25,
              recipient: {
                contactName: "สมศรี ใจดี",
                phone: "0891112222",
                addressShort: "88/9 ถนนสุขุมวิท พระโขนงเหนือ วัฒนา กรุงเทพมหานคร 10110",
              },
              createdAt: "2026-07-20T01:00:00.000Z",
            },
            {
              id: "parcel-2",
              trackingId: "TRACK-2",
              barcode: "WB222222222TH",
              displayCode: "WB222222222TH",
              weightKg: 2,
              recipient: {
                contactName: "มานะ ดีมาก",
                phone: "0863334444",
                addressShort: "999 ถนนสีลม สุริยวงศ์ บางรัก กรุงเทพมหานคร 10500",
              },
              createdAt: "2026-07-20T02:00:00.000Z",
            },
            {
              id: "parcel-3",
              trackingId: "TRACK-3",
              barcode: "WB333333333TH",
              displayCode: "WB333333333TH",
              weightKg: 30.001,
              recipient: {
                contactName: "-",
                phone: "-",
                addressShort: "-",
              },
              createdAt: "2026-07-20T03:00:00.000Z",
            },
          ],
          activePickupParcelCount:
            pickupParcelCounts?.activePickupParcelCount ?? 0,
          unavailablePickupParcelCount:
            pickupParcelCounts?.unavailablePickupParcelCount ?? 0,
        },
      });
    }
    if (route.request().method() === "GET") {
      return json(route, { ok: true, data: { items: historyItems, page: 1, hasMore: false } });
    }
    if (route.request().method() === "POST" && url.pathname === "/api/pickup") {
      const submitted = route.request().postDataJSON() as { parcelIds?: string[] };
      return json(route, {
        ok: true,
        data: {
          id: "pickup-1",
          inputSource: "system",
          contactName: sender.contactName,
          contactPhone: sender.phone,
          recipientNames: ["สมศรี ใจดี"],
          pickupAddressFull: "123 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 10110",
          parcelCount: submitted.parcelIds?.length ?? 1,
          heaviestWeightKg: 1.25,
          remark: "พัสดุขนาดใหญ่",
          status: "requested",
          ticketPickupId: "15315219",
          providerMessage: "เรียกรถเข้ารับสำเร็จ",
          staffInfoName: null,
          staffInfoPhone: null,
          timeoutAtText: null,
          ticketMessage: null,
          failureMessage: null,
          canCancel: true,
          acceptedAt: null,
          closedAt: null,
          createdAt: "2026-07-20T03:00:00.000Z",
          updatedAt: "2026-07-20T03:00:00.000Z",
        },
      });
    }
    return json(route, { ok: false, error: "Unexpected request" }, 500);
  });
}

test("homepage places pickup beside send parcel in the first service row", async ({ page }) => {
  await loginAsTestUser(page);
  await mockSendAccessAllowed(page);
  await page.goto("/");
  const send = page.getByRole("link", { name: /ส่งพัสดุ/ }).first();
  const pickup = page.getByRole("link", { name: /เรียกรถเข้ารับ/ });
  await expect(send).toBeVisible();
  await expect(pickup).toBeVisible();
  const [sendBox, pickupBox] = await Promise.all([send.boundingBox(), pickup.boundingBox()]);
  expect(sendBox).not.toBeNull();
  expect(pickupBox).not.toBeNull();
  expect(Math.abs(sendBox!.y - pickupBox!.y)).toBeLessThan(2);
  expect(pickupBox!.x).toBeGreaterThan(sendBox!.x);

  await page.mouse.move(sendBox!.x + sendBox!.width / 2, sendBox!.y + sendBox!.height / 2);
  await page.mouse.down();
  await expect(send).toHaveCSS("background-color", "rgb(224, 231, 255)");
  await expect(send).toHaveCSS("opacity", "1");
  await page.mouse.up();
});

test("recipient-focused cards allow mixed sender snapshots and hide parcel measurements", async ({ page }) => {
  await mockPickupApis(page);
  await page.goto("/pickup");
  await expect(page.getByRole("navigation")).toHaveCount(0);
  const submitBar = page.getByTestId("pickup-submit-bar");
  await expect(submitBar).toHaveCSS("position", "fixed");
  await expect(submitBar).toHaveCSS("bottom", "0px");
  await expect(page.getByRole("link", { name: "กลับไปหน้าแรก" })).toHaveText("←กลับ");
  await expect(page.getByText("กรอกเอง", { exact: true })).toHaveCount(0);
  await expect(page.getByText("ที่อยู่เข้ารับพัสดุ")).toBeVisible();
  await expect(page.getByRole("link", { name: /สมชาย ใจดี/ })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "เปิดสมุดที่อยู่เพื่อเลือกที่อยู่เข้ารับพัสดุ" }),
  ).toHaveAttribute("href", /\/addresses\?.*from=pickup/);
  const first = page.getByLabel(/WB111111111TH/);
  const second = page.getByLabel(/WB222222222TH/);
  const overweight = page.getByLabel(/WB333333333TH/);
  await expect(overweight).toBeDisabled();
  await expect(page.getByText("พัสดุมีน้ำหนักเกิน 30 กก. ไม่สามารถเรียกรถได้")).toBeVisible();
  await expect(page.getByText("สมศรี ใจดี · 0891112222")).toBeVisible();
  await expect(page.getByText(/88\/9 ถนนสุขุมวิท พระโขนงเหนือ/)).toBeVisible();
  await expect(page.getByText("1.25 กก.")).toHaveCount(0);
  await expect(page.getByText("123 ถนนสุขุมวิท คลองเตย คลองเตย กรุงเทพมหานคร 10110")).toHaveCount(0);
  await first.check();
  await expect(second).toBeEnabled();
  await second.check();
  await expect(first).toBeChecked();
  await expect(second).toBeChecked();
  await page.getByRole("button", { name: /ลงทะเบียนพัสดุใหม่/ }).click();
  await expect(page).toHaveURL(/\/pickup\/register\?senderId=sender-address-1/);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "ลงทะเบียนพัสดุใหม่" })).toBeFocused();
  await expect(page.getByText("ประวัติการเรียกรถ")).toHaveCount(0);
  await page.getByRole("link", { name: "กลับไปเลือกพัสดุ" }).click();
  await expect(page).toHaveURL(/\/pickup\?senderId=sender-address-1/);
  await expect(page.getByRole("heading", { name: "เลือกพัสดุที่รอนำส่งไปรษณีย์" })).toBeVisible();
  await expect(first).toBeChecked();
  await expect(second).toBeChecked();
});

test("long parcel lists stay bounded and scroll inside the parcel frame", async ({ page }) => {
  const manyParcels = Array.from({ length: 8 }, (_, index) => ({
    id: `parcel-${index + 1}`,
    trackingId: `TRACK-${index + 1}`,
    barcode: `WB${String(index + 1).padStart(9, "0")}TH`,
    displayCode: `WB${String(index + 1).padStart(9, "0")}TH`,
    weightKg: 1,
    recipient: {
      contactName: `ผู้รับ ${index + 1}`,
      phone: `08123456${String(index).padStart(2, "0")}`,
      addressShort: `${index + 1} ถนนสุขุมวิท กรุงเทพมหานคร 10110`,
    },
    createdAt: `2026-07-20T${String(index).padStart(2, "0")}:00:00.000Z`,
  }));
  await mockPickupApis(page, [], manyParcels);
  await page.goto("/pickup");

  const parcelList = page.getByTestId("eligible-parcel-list");
  await expect(parcelList).toHaveCSS("overflow-y", "auto");
  expect(
    await parcelList.evaluate((element) => element.scrollHeight > element.clientHeight),
  ).toBe(true);

  await page.getByLabel(/WB000000001TH/).check();
  await page.getByLabel(/WB000000008TH/).check();
  await expect(page.getByText("เลือกแล้ว 2 ชิ้น")).toBeVisible();
  expect(await parcelList.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});

test("already requested parcels are explained without appearing in the selector", async ({
  page,
}) => {
  await mockPickupApis(page, [], [], {
    activePickupParcelCount: 2,
    unavailablePickupParcelCount: 2,
  });
  await page.goto("/pickup");

  await expect(
    page.getByText(/มีพัสดุ\s*2\s*ชิ้น\s*อยู่ในรายการเข้ารับ/),
  ).toBeVisible();
  await expect(
    page.getByText("พัสดุทั้งหมดอยู่ในรายการเข้ารับแล้ว"),
  ).toBeVisible();
  await expect(
    page.getByText("ติดตามสถานะรายการเดิม หรือลงทะเบียนพัสดุใหม่"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "ดูสถานะการเข้ารับ" }).last(),
  ).toHaveAttribute("href", "/pickup/requests");
  await expect(
    page.getByRole("button", { name: "ลงทะเบียนพัสดุใหม่" }),
  ).toBeVisible();
  await expect(page.getByTestId("eligible-parcel-list")).toHaveCount(0);
  await expect(page.getByTestId("pickup-submit-bar")).toHaveCount(0);
});

test("a parcel reserved from another tab is removed and explained after submit", async ({
  page,
}) => {
  await mockPickupApis(page);
  let hasConflict = false;
  await page.route("**/api/pickup**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/eligible-parcels") && hasConflict) {
      return json(route, {
        ok: true,
        data: {
          items: [],
          activePickupParcelCount: 1,
          unavailablePickupParcelCount: 1,
        },
      });
    }
    if (route.request().method() === "POST" && url.pathname === "/api/pickup") {
      hasConflict = true;
      return json(
        route,
        {
          ok: false,
          code: "PICKUP_PARCEL_CONFLICT",
          error: "พัสดุบางรายการมีคำขอเข้ารับที่กำลังดำเนินการอยู่แล้ว",
        },
        409,
      );
    }
    return route.fallback();
  });

  await page.goto("/pickup");
  await page.getByLabel(/WB111111111TH/).check();
  await page.getByRole("button", { name: "ยืนยันเรียกรถเข้ารับ" }).click();

  await expect(
    page.getByRole("alert").filter({
      hasText:
        "พัสดุที่เลือกบางรายการอยู่ในคำขอเข้ารับแล้ว ระบบอัปเดตรายการให้เรียบร้อย",
    }),
  ).toBeVisible();
  await expect(page.getByLabel(/WB111111111TH/)).toHaveCount(0);
  await expect(
    page.getByText("พัสดุทั้งหมดอยู่ในรายการเข้ารับแล้ว"),
  ).toBeVisible();
});

test("focused registration mode creates a pickup parcel and returns with it selected", async ({ page }) => {
  let parcelCreated = false;
  await page.route("**/api/sender-addresses**", (route) =>
    json(route, { ok: true, data: [senderAddress] }),
  );
  await page.route("**/api/recipient-addresses**", async (route) => {
    if (route.request().method() === "GET") {
      return json(route, { ok: true, data: [recipient] });
    }
    return route.fallback();
  });
  await page.route("**/api/pricing/estimate**", (route) =>
    json(route, { ok: true, data: { estimatedTotal: 35 } }),
  );
  await page.route("**/api/smartpost/add-item", (route) =>
    json(route, { ok: true, data: { trackingNo: "WB444444444TH" } }),
  );
  await page.route("**/api/parcels/draft", (route) => {
    parcelCreated = true;
    return json(route, { ok: true, data: { id: "parcel-4", trackingId: "TRACK-4" } });
  });
  await page.route("**/api/pickup**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/eligible-parcels")) {
      return json(route, {
        ok: true,
        data: {
          items:
            !parcelCreated
              ? []
              : [
                  {
                    id: "parcel-4",
                    trackingId: "TRACK-4",
                    barcode: "WB444444444TH",
                    displayCode: "WB444444444TH",
                    weightKg: 1,
                    recipient: {
                      contactName: recipient.contactName,
                      phone: recipient.phone,
                      addressShort: "88/9 ถนนสุขุมวิท พระโขนงเหนือ วัฒนา กรุงเทพมหานคร 10110",
                    },
                    createdAt: "2026-07-20T04:00:00.000Z",
                  },
                ],
        },
      });
    }
    if (route.request().method() === "GET") {
      return json(route, { ok: true, data: { items: [], page: 1, hasMore: false } });
    }
    return route.fallback();
  });

  await page.goto("/pickup");
  await expect(page).toHaveURL(/\/pickup$/);
  const registrationButton = page.getByRole("button", { name: "ลงทะเบียนพัสดุใหม่" });
  await registrationButton.click();
  await expect(page).toHaveURL(/\/pickup\/register\?senderId=sender-address-1/);
  await expect(page.getByRole("heading", { name: "ลงทะเบียนพัสดุใหม่" })).toBeFocused();
  await expect(page.getByRole("link", { name: "กลับไปเลือกพัสดุ" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ประวัติการเรียกรถ" })).toHaveCount(0);
  await page.getByLabel("น้ำหนัก (กรัม)").fill("1000");
  await page.getByLabel("ขนาดพัสดุ").selectOption("box-a");
  await page.getByLabel("ประเภทพัสดุ").selectOption("เอกสาร");
  if (process.env.PICKUP_ACCORDION_SCREENSHOT_PATH) {
    await page.screenshot({
      path: process.env.PICKUP_ACCORDION_SCREENSHOT_PATH,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "ตรวจสอบข้อมูลและราคา" }).click();
  await expect(page.getByRole("heading", { name: "ตรวจสอบพัสดุ" })).toBeVisible();
  await expect(page.getByText("35 บาท")).toBeVisible();
  await page.getByRole("button", { name: "ยืนยันสร้างพัสดุ" }).click();

  await expect(page).toHaveURL(/\/pickup\?senderId=sender-address-1/);
  await expect(page.getByRole("heading", { name: "เลือกพัสดุที่รอนำส่งไปรษณีย์" })).toBeVisible();
  await expect(page.getByLabel(/WB444444444TH/)).toBeChecked();
});

test("system-only pickup submits a selected parcel and keeps provider service internal", async ({ page }) => {
  await mockPickupApis(page);
  let submittedSenderAddressId: string | undefined;
  await page.route("**/api/pickup", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const submitted = route.request().postDataJSON() as { senderAddressId?: string };
    submittedSenderAddressId = submitted.senderAddressId;
    return route.fallback();
  });
  await page.goto("/pickup");
  await page.getByLabel(/WB111111111TH/).check();
  await page.getByLabel(/หมายเหตุถึงพนักงาน/).fill("พัสดุขนาดใหญ่");
  await expect(page.getByText(/THP_eParcel[XYZ]/)).toHaveCount(0);
  if (process.env.PICKUP_SCREENSHOT_PATH) {
    await page.screenshot({ path: process.env.PICKUP_SCREENSHOT_PATH, fullPage: true });
  }
  await page.getByRole("button", { name: "ยืนยันเรียกรถเข้ารับ" }).click();
  const confirmationHeading = page.getByRole("heading", {
    name: "ส่งคำขอเรียกรถแล้ว",
  });
  await expect(confirmationHeading).toBeVisible();
  await expect(confirmationHeading).toBeFocused();
  await expect(page.getByText("รอไปรษณีย์เข้ารับ", { exact: true })).toBeVisible();
  await expect(page.getByTestId("pickup-confirmation-ticket")).toHaveText("15315219");
  await expect(page.getByText("1 ชิ้น", { exact: true })).toBeVisible();
  await expect(page.getByText(/123 ถนนสุขุมวิท.*10110/)).toBeVisible();
  await expect(page.getByRole("link", { name: "ดูสถานะการเข้ารับ" })).toBeVisible();
  await expect(page.getByRole("link", { name: "กลับหน้าแรก" })).toBeVisible();
  await expect(page.getByTestId("pickup-submit-bar")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "เลือกพัสดุที่รอนำส่งไปรษณีย์" })).toHaveCount(0);
  if (process.env.PICKUP_SUCCESS_SCREENSHOT_PATH) {
    await page.screenshot({
      path: process.env.PICKUP_SUCCESS_SCREENSHOT_PATH,
      fullPage: true,
    });
  }
  expect(submittedSenderAddressId).toBe(senderAddress.id);
});

test("system pickup replaces an HTML API error with a customer-safe message", async ({ page }) => {
  await mockPickupApis(page);
  await page.route("**/api/pickup", async (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 404,
        contentType: "text/html",
        body: "<!DOCTYPE html><html><body>Not Found</body></html>",
      });
    }
    return route.fallback();
  });
  await page.goto("/pickup");
  await page.getByLabel(/WB111111111TH/).check();
  await page.getByLabel(/หมายเหตุถึงพนักงาน/).fill(
    "หมายเหตุถุงพนักงานกดหกดกหดฟหดหฟสากท หกสาทดสฟ าหกทด สฟาหกทดสาหกท",
  );
  await page.getByRole("button", { name: "ยืนยันเรียกรถเข้ารับ" }).click();

  await expect(
    page.getByText("ระบบเรียกรถเข้ารับยังไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง"),
  ).toBeVisible();
  await expect(page.getByText(/Unexpected token|DOCTYPE/i)).toHaveCount(0);
});

test("pickup submit is never automatically retried after a server error", async ({ page }) => {
  await mockPickupApis(page);
  let submitCount = 0;
  await page.route("**/api/pickup", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    submitCount += 1;
    return json(
      route,
      {
        ok: false,
        error:
          "ยังยืนยันสถานะคำขอไม่ได้ ระบบจะไม่ส่งคำขอซ้ำเพื่อป้องกันรถเข้ารับซ้ำ",
        ambiguous: true,
      },
      503,
    );
  });

  await page.goto("/pickup");
  await page.getByLabel(/WB111111111TH/).check();
  await page.getByRole("button", { name: "ยืนยันเรียกรถเข้ารับ" }).click();

  await expect(
    page.getByText(
      "ยังยืนยันสถานะคำขอไม่ได้ ระบบจะไม่ส่งคำขอซ้ำเพื่อป้องกันรถเข้ารับซ้ำ",
      { exact: true },
    ),
  ).toBeVisible();
  expect(submitCount).toBe(1);
});

test("an accepted pickup stays successful while local persistence is syncing", async ({
  page,
}) => {
  await mockPickupApis(page);
  await page.route("**/api/pickup", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    return json(
      route,
      {
        ok: true,
        persistencePending: true,
        warning:
          "ส่งคำขอเรียกรถสำเร็จแล้ว ระบบกำลังซิงก์ข้อมูล กรุณาอย่าส่งคำขอซ้ำ",
        data: {
          id: "pickup-persistence-pending",
          inputSource: "system",
          contactName: sender.contactName,
          contactPhone: sender.phone,
          recipientNames: ["สมศรี ใจดี"],
          pickupAddressFull:
            "123 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 10110",
          parcelCount: 1,
          heaviestWeightKg: 1.25,
          remark: "",
          status: "requested",
          ticketPickupId: "ABC123",
          providerMessage: "เรียกรถเข้ารับสำเร็จ",
          staffInfoName: null,
          staffInfoPhone: null,
          timeoutAtText: null,
          ticketMessage: null,
          failureMessage: null,
          canCancel: true,
          acceptedAt: null,
          closedAt: null,
          createdAt: "2026-07-31T06:00:00.000Z",
          updatedAt: "2026-07-31T06:00:00.000Z",
        },
      },
      202,
    );
  });

  await page.goto("/pickup");
  await page.getByLabel(/WB111111111TH/).check();
  await page.getByRole("button", { name: "ยืนยันเรียกรถเข้ารับ" }).click();

  await expect(
    page.getByRole("heading", { name: "ส่งคำขอเรียกรถแล้ว" }),
  ).toBeVisible();
  await expect(page.getByTestId("pickup-confirmation-ticket")).toHaveText(
    "ABC123",
  );
  await expect(
    page.getByText(
      "ส่งคำขอเรียกรถสำเร็จแล้ว ระบบกำลังซิงก์ข้อมูล กรุณาอย่าส่งคำขอซ้ำ",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText(/บันทึกผลคำขอเรียกรถไม่สำเร็จ/)).toHaveCount(0);
});

test("pickup requests use a circular header action and keep cancellation in the overflow menu", async ({ page }) => {
  await mockPickupApis(page, [
    {
      id: "pickup-history-1",
      inputSource: "system",
      contactName: sender.contactName,
      contactPhone: sender.phone,
      recipientNames: ["สมศรี ใจดี", "มานะ ดีมาก"],
      pickupAddressFull: "123 ถนนสุขุมวิท คลองเตย คลองเตย กรุงเทพมหานคร 10110",
      parcelCount: 3,
      heaviestWeightKg: 2,
      remark: "",
      status: "assigned",
      ticketPickupId: "TP20260721001",
      providerMessage: "เรียกรถเข้ารับสำเร็จ",
      staffInfoName: "สมชาย ใจดี",
      staffInfoPhone: "0819876543",
      timeoutAtText: "วันนี้ 11:00 ~ 13:00",
      ticketMessage: "กรุณาเตรียมพัสดุให้พร้อม",
      failureMessage: null,
      canCancel: true,
      acceptedAt: "2026-07-21T03:30:00.000Z",
      closedAt: null,
      createdAt: "2026-07-21T03:00:00.000Z",
      updatedAt: "2026-07-21T03:00:00.000Z",
    },
  ]);
  await page.goto("/pickup");

  const requestsLink = page.getByRole("link", {
    name: "รายการเข้ารับ",
    exact: true,
  });
  await expect(requestsLink).toBeVisible();
  const requestsLinkBox = await requestsLink.boundingBox();
  expect(requestsLinkBox).not.toBeNull();
  expect(Math.abs(requestsLinkBox!.width - requestsLinkBox!.height)).toBeLessThan(1);
  await expect(
    page.getByText(/มีพัสดุ\s*3\s*ชิ้น\s*อยู่ในรายการเข้ารับ/),
  ).toBeVisible();
  await expect(
    page.getByText("พนักงานกำลังเข้ารับพัสดุ · TP20260721001"),
  ).toBeVisible();
  const activeTruck = page.getByTestId("active-pickup-truck");
  const activeTruckFrame = page.getByTestId("active-pickup-truck-frame");
  await expect(activeTruck).toBeVisible();
  const activeTruckBox = await activeTruck.boundingBox();
  const activeTruckFrameBox = await activeTruckFrame.boundingBox();
  expect(activeTruckBox).not.toBeNull();
  expect(activeTruckFrameBox).not.toBeNull();
  expect(Math.abs(activeTruckBox!.width - activeTruckBox!.height)).toBeLessThan(1);
  expect(Math.abs(activeTruckFrameBox!.width - activeTruckFrameBox!.height)).toBeLessThan(1);
  if (process.env.PICKUP_ACTIVE_SCREENSHOT_PATH) {
    await page.screenshot({
      path: process.env.PICKUP_ACTIVE_SCREENSHOT_PATH,
      fullPage: true,
    });
  }
  await requestsLink.click();
  await expect(page).toHaveURL(/\/pickup\/requests$/);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "รายการเข้ารับ" })).toBeVisible();

  const history = page.getByRole("region", { name: "คำขอที่กำลังดำเนินการ" });
  await expect(history.getByTestId("pickup-tracking-card")).toBeVisible();
  await expect(history.getByText("เลขที่คำขอ")).toBeVisible();
  await expect(history.getByText("#TP20260721001")).toBeVisible();
  await expect(history.getByLabel("ความคืบหน้า 2 จาก 3 ขั้น")).toBeVisible();
  await expect(history.getByText("ส่งคำขอ", { exact: true })).toBeVisible();
  await expect(history.getByText("พนักงานรับงาน", { exact: true })).toBeVisible();
  await expect(history.getByText("เข้ารับแล้ว", { exact: true })).toBeVisible();
  await expect(history.getByText("จำนวนพัสดุ")).toBeVisible();
  await expect(history.getByText("ผู้รับ", { exact: true })).toBeVisible();
  await expect(history.getByText("สมศรี ใจดี · มานะ ดีมาก")).toBeVisible();
  const requestDetailsGrid = history
    .getByText("ที่อยู่เข้ารับ", { exact: true })
    .locator("..")
    .locator("..");
  const requestDetailColumns = await requestDetailsGrid.evaluate((element) =>
    getComputedStyle(element).gridTemplateColumns
      .split(" ")
      .map((column) => Number.parseFloat(column)),
  );
  expect(Math.abs(requestDetailColumns[0] - requestDetailColumns[1])).toBeLessThan(1);
  await expect(history.getByText("สมชาย ใจดี · 0819876543")).toBeVisible();
  const staffHeading = history.getByText("พนักงานเข้ารับ", { exact: true });
  const pickupInfoHeading = history.getByText("ข้อมูลการเข้ารับ", {
    exact: true,
  });
  const [staffHeadingBox, pickupInfoHeadingBox] = await Promise.all([
    staffHeading.boundingBox(),
    pickupInfoHeading.boundingBox(),
  ]);
  expect(staffHeadingBox).not.toBeNull();
  expect(pickupInfoHeadingBox).not.toBeNull();
  expect(Math.abs(staffHeadingBox!.y - pickupInfoHeadingBox!.y)).toBeLessThan(2);
  await expect(page.getByRole("button", { name: "โหลดรายการเข้ารับอีกครั้ง" })).toBeVisible();
  await expect(history.getByText("รีเฟรช", { exact: true })).toHaveCount(0);
  await expect(history.getByRole("button", { name: "ยืนยันยกเลิก" })).toHaveCount(0);
  if (process.env.PICKUP_HISTORY_CARD_SCREENSHOT_PATH) {
    await page.screenshot({
      path: process.env.PICKUP_HISTORY_CARD_SCREENSHOT_PATH,
      fullPage: true,
    });
  }

  await history.getByRole("button", { name: "ตัวเลือกคำขอเข้ารับ" }).click();
  await expect(history.getByRole("menuitem", { name: "ยกเลิกการเข้ารับ" })).toBeVisible();
  await expect(page.getByText(/i\s*ship/i)).toHaveCount(0);
  if (process.env.PICKUP_HISTORY_SCREENSHOT_PATH) {
    await page.screenshot({ path: process.env.PICKUP_HISTORY_SCREENSHOT_PATH, fullPage: true });
  }
});
