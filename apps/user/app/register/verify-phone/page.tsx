import { PhoneVerificationPage } from "../../profile-phone-verification";

export default function RegisterVerifyPhonePage() {
  return (
    <PhoneVerificationPage
      backHref="/register"
      successHref="/"
      successMessage="ยืนยันเบอร์โทรสำเร็จ กำลังพาไปหน้าหลัก…"
    />
  );
}
