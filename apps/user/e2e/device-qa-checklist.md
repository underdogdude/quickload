# Device QA Checklist — LINE WebView

Manual tests that cannot be automated because they require real LINE in-app browser behaviour.

Run these before every production release on **both iOS LINE and Android LINE**.

---

## Prerequisites

- Deploy to a staging URL accessible via LINE LIFF
- Configure `LIFF_ID` in staging to point to staging URL
- Tester must be a registered LINE user

---

## 1. Date Input Rendering (`globals.css` fix)

| Step | Expected |
|------|----------|
| Open `/register` on iOS LINE | `birthDate` date field renders with full height, not collapsed |
| Open `/register` on Android LINE | Date field shows calendar picker (not text input) |
| Tap date field on iOS | Calendar opens (does not show invisible/transparent field) |
| Tap date field on Android | Native date picker opens |

---

## 2. Web Share API for PromptPay QR (`save-promptpay-qr-image.ts`)

| Step | Expected |
|------|----------|
| Navigate to `/pay/[parcelId]` with a pending PromptPay charge | QR code renders |
| Tap "บันทึก QR" button on iOS LINE | iOS share sheet appears with "Save Image" option |
| Tap "Save Image" or cancel share | Image saved to Photos OR cancel returns `ok: true` (no error) |
| Tap "บันทึก QR" on Android LINE | Android share sheet appears; image can be saved to gallery |
| Test with `navigator.canShare` = false (Desktop browser) | Falls back to direct download (`<a download>` click) |

---

## 3. LIFF Init and Token Exchange

| Step | Expected |
|------|----------|
| Open LIFF URL directly in LINE | `liff.init()` completes, user sees `/entry` then `/` |
| Open LIFF URL in LINE when not logged in | LINE prompts login, then redirects back |
| Open LIFF URL in external browser (e.g. Safari) | Shows LINE login button or redirects to LINE |
| Reopen LIFF after session expiry (iron-session cookie expired) | Gracefully re-authenticates without white screen |

---

## 4. PDF Label Download

| Step | Expected |
|------|----------|
| Tap label download button on `/parcels/[id]` on iOS LINE | PDF opens in previewer (not blank page) |
| Tap label download on Android LINE | PDF downloads or opens in viewer |
| Test with expired flex token | Shows error page, not 500 |

---

## 5. OTP PIN Input — Keyboard Behaviour

| Step | Expected |
|------|----------|
| Open `/register/verify-phone` on iPhone | Numeric keyboard opens automatically when first digit box focused |
| Enter 6 digits one by one | Focus auto-advances to next box |
| Long-press on iOS to paste OTP from SMS | All 6 digits fill correctly; auto-submits |
| Use Android autofill OTP suggestion | All 6 digits fill; auto-submits |
| Tap backspace on empty box | Focus moves to previous box |
| Page does NOT scroll behind keyboard | Entire PIN form stays visible |

---

## 6. Payment — Bank App Redirects

| Step | Expected |
|------|----------|
| Select K PLUS on `/pay/[parcelId]` | Redirects out to K PLUS app |
| Return to LINE app after K PLUS | Charge status shows "succeeded" or "pending" correctly |
| Select SCB Easy | Same redirect behaviour |
| Select TrueMoney Wallet | Same redirect behaviour |

---

## 7. Cooldown Timer — Resend OTP

| Step | Expected |
|------|----------|
| OTP sent on verify-phone page | "ส่งอีกครั้งได้ใน 60 วินาที" countdown appears |
| Wait 60 seconds | "ส่งรหัส OTP อีกครั้ง" button re-appears |
| Tap resend | New OTP sent; countdown resets to 60 |
| Tap resend within cooldown | Cooldown remaining shown, no duplicate SMS |

---

## Test Matrix

| Feature | iPhone 15 (iOS 17) LINE | Samsung Galaxy (Android 14) LINE |
|---------|------------------------|----------------------------------|
| Date input rendering | ☐ | ☐ |
| QR save share | ☐ | ☐ |
| LIFF init | ☐ | ☐ |
| PDF download | ☐ | ☐ |
| OTP keyboard | ☐ | ☐ |
| Bank app redirect | ☐ | ☐ |
| Resend cooldown | ☐ | ☐ |

Mark each ☐ with ✅ Pass or ❌ Fail + note before every release.
