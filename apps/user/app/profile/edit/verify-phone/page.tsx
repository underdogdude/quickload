import { PhoneVerificationPage } from "../../../profile-phone-verification";

export default function ProfileEditVerifyPhonePage() {
  return (
    <PhoneVerificationPage
      backHref="/profile/edit"
      successHref="/profile"
      successMessage="ยืนยันเบอร์โทรสำเร็จ กำลังกลับไปหน้าโปรไฟล์…"
    />
  );
}
