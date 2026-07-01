import Link from "next/link";
import { ManualPageActions } from "./manual-page-actions";

const steps = [
  {
    title: "1) กรอกข้อมูลผู้ส่งและผู้รับ",
    description:
      "ไปที่เมนู ส่งพัสดุ แล้วเพิ่มข้อมูลผู้ส่ง/ผู้รับให้ครบถ้วน โดยใช้เบอร์โทรในรูปแบบ 0xxxxxxxxx เท่านั้น",
  },
  {
    title: "2) ระบุรายละเอียดพัสดุ",
    description:
      "กรอกน้ำหนัก ขนาด ประเภทพัสดุ และหมายเหตุ (ถ้ามี) จากนั้นตรวจสอบข้อมูลในหน้ารีวิวก่อนยืนยัน",
  },
  {
    title: "3) ชำระเงิน",
    description:
      "หลังสร้างรายการสำเร็จ ไปที่เมนู ชำระเงิน เพื่อตรวจสอบยอดคงค้างและดำเนินการชำระตามขั้นตอน",
  },
  {
    title: "4) ติดตามและจัดการรายการ",
    description:
      "ไปที่เมนู พัสดุ เพื่อค้นหาด้วยเลขพัสดุ/บาร์โค้ด ดูสถานะ และเปิด QR หรือ Barcode ได้จากการ์ดรายการ",
  },
];

export default function ManualPage() {
  return (
    <main className="min-h-screen bg-slate-100 pb-28">
      <section className="bg-[#2726F5] px-6 pb-14 pt-10 text-white">
        <div className="mx-auto w-full max-w-lg">
          <Link
            href="/"
            className="mb-3 inline-flex items-center gap-1 rounded-full border border-white/40 px-3 py-1.5 text-xs font-medium text-white/95"
            aria-label="กลับไปหน้าแรก"
          >
            <span aria-hidden>←</span>
            <span>กลับ</span>
          </Link>
          <h1 className="text-3xl font-bold leading-none">คู่มือการใช้งาน</h1>
          <p className="mt-1 text-sm text-white/80">ขั้นตอนการใช้งานระบบส่งพัสดุแบบสั้นและเข้าใจง่าย</p>
        </div>
      </section>

      <section className="-mt-8 px-6">
        <div className="mx-auto w-full max-w-lg space-y-3">
          {steps.map((step) => (
            <article key={step.title} className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">{step.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{step.description}</p>
            </article>
          ))}

          <ManualPageActions />
        </div>
      </section>
    </main>
  );
}
