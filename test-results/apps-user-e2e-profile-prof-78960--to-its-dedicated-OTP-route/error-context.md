# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: apps/user/e2e/profile.spec.ts >> profile edit sends changed phone to its dedicated OTP route
- Location: apps/user/e2e/profile.spec.ts:124:1

# Error details

```
TypeError: apiRequestContext.post: Invalid URL
```

# Test source

```ts
  124 |         ],
  125 |       }),
  126 |     }),
  127 |   );
  128 | }
  129 | 
  130 | export async function mockRecipientAddresses(page: Page) {
  131 |   await apiRoute(page, "/api/recipient-addresses", (route) =>
  132 |     route.fulfill({
  133 |       status: 200,
  134 |       contentType: "application/json",
  135 |       body: JSON.stringify({
  136 |         ok: true,
  137 |         data: [
  138 |           {
  139 |             id: "recipient-1",
  140 |             contactName: "สมหญิง รักดี",
  141 |             phone: "0987654321",
  142 |             addressLine: "456 ถนนสุขุมวิท",
  143 |             tambon: "คลองเตย",
  144 |             amphoe: "คลองเตย",
  145 |             province: "กรุงเทพมหานคร",
  146 |             zipcode: "10110",
  147 |           },
  148 |         ],
  149 |       }),
  150 |     }),
  151 |   );
  152 | }
  153 | 
  154 | export const E2E_PARCEL_ID = "parcel-uuid-001";
  155 | export const E2E_PAYMENT_ID = "payment-uuid-001";
  156 | export const E2E_QR_PAYLOAD = "00020101021229370016A000000677010111011300668123456785802TH53037645403500354035.005802TH6304ABCD";
  157 | 
  158 | export const E2E_PROMPTPAY_CHARGE = {
  159 |   paymentId: E2E_PAYMENT_ID,
  160 |   status: "pending" as const,
  161 |   amount: "35.00",
  162 |   currency: "THB",
  163 |   paymentMethod: "promptpay",
  164 |   qrPayload: E2E_QR_PAYLOAD,
  165 |   redirectUrl: null,
  166 |   actionRequired: "ENCODED_IMAGE" as const,
  167 |   expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  168 |   paidAt: null,
  169 |   parcelId: E2E_PARCEL_ID,
  170 |   barcode: "TH001234567890",
  171 |   trackingId: "SP001234",
  172 |   outstanding: { state: "unpaid" as const, totalOwed: 35, outstanding: 35 },
  173 | };
  174 | 
  175 | /** Mock the full single-parcel pay page API sequence. */
  176 | export async function mockSingleParcelPayment(page: Page) {
  177 |   await apiRoute(page, "/api/payment/charges?parcelId=*", (route) => {
  178 |     if (route.request().method() !== "GET") return route.continue();
  179 |     return route.fulfill({
  180 |       status: 200,
  181 |       contentType: "application/json",
  182 |       body: JSON.stringify({ ok: true, data: { needsCharge: true } }),
  183 |     });
  184 |   });
  185 | 
  186 |   await apiRoute(page, "/api/payment/charges", (route) => {
  187 |     if (route.request().method() !== "POST") return route.continue();
  188 |     return route.fulfill({
  189 |       status: 200,
  190 |       contentType: "application/json",
  191 |       body: JSON.stringify({
  192 |         ok: true,
  193 |         data: {
  194 |           paymentId: E2E_PAYMENT_ID,
  195 |           status: "pending",
  196 |           amount: "35.00",
  197 |           currency: "THB",
  198 |           paymentMethod: "promptpay",
  199 |           qrPayload: E2E_QR_PAYLOAD,
  200 |           redirectUrl: null,
  201 |           actionRequired: "ENCODED_IMAGE",
  202 |           expiresAt: E2E_PROMPTPAY_CHARGE.expiresAt,
  203 |         },
  204 |       }),
  205 |     });
  206 |   });
  207 | 
  208 |   await apiRoute(page, `/api/payment/charges/${E2E_PAYMENT_ID}`, (route) =>
  209 |     route.fulfill({
  210 |       status: 200,
  211 |       contentType: "application/json",
  212 |       body: JSON.stringify({ ok: true, data: E2E_PROMPTPAY_CHARGE }),
  213 |     }),
  214 |   );
  215 | }
  216 | 
  217 | /** Standard E2E page setup: block LINE redirects + optional API mocks. */
  218 | export async function setupE2EPage(page: Page) {
  219 |   await blockExternalLineRequests(page);
  220 | }
  221 | 
  222 | /** Create iron-session cookie so LoggedInShell + SendAccessProvider render. */
  223 | export async function loginAsTestUser(page: Page) {
> 224 |   const res = await page.request.post("/api/dev/e2e-session");
      |                                  ^ TypeError: apiRequestContext.post: Invalid URL
  225 |   if (!res.ok()) {
  226 |     throw new Error(`Failed to create E2E session: ${res.status()} ${await res.text()}`);
  227 |   }
  228 | }
  229 | 
  230 | /** Mock send-access check (used by SendAccessProvider). */
  231 | export async function mockSendAccessAllowed(page: Page) {
  232 |   await apiRoute(page, "/api/send/access", (route) =>
  233 |     route.fulfill({
  234 |       status: 200,
  235 |       contentType: "application/json",
  236 |       body: JSON.stringify({
  237 |         ok: true,
  238 |         data: { blocked: false, overdueParcelCount: 0, message: null },
  239 |       }),
  240 |     }),
  241 |   );
  242 | }
  243 | 
  244 | /** Mock overdue unpaid parcel blocking /send. */
  245 | export async function mockSendAccessBlocked(page: Page) {
  246 |   await apiRoute(page, "/api/send/access", (route) =>
  247 |     route.fulfill({
  248 |       status: 200,
  249 |       contentType: "application/json",
  250 |       body: JSON.stringify({
  251 |         ok: true,
  252 |         data: {
  253 |           blocked: true,
  254 |           overdueParcelCount: 1,
  255 |           message: "คุณมีพัสดุค้างชำระเกิน 24 ชม. ไม่สามารถทำรายการส่งพัสดุใหม่ได้ กรุณาชำระก่อนส่งพัสดุใหม่",
  256 |         },
  257 |       }),
  258 |     }),
  259 |   );
  260 | }
  261 | 
```