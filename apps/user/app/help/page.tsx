"use client";

import Link from "next/link";
import { useState } from "react";

const CUSTOMER_SERVICE_PHONE = "093-124-8574";
const CUSTOMER_SERVICE_PHONE_TEL = "0931248574";
const CUSTOMER_SERVICE_LINE_URL = "https://lin.ee/6c3gPxZ";

const FAQ_ITEMS = [
  {
    id: "send-parcel",
    question: "ส่งพัสดุผ่าน Quickload อย่างไร?",
    answer:
      "ไปที่เมนู ส่งพัสดุ กรอกข้อมูลผู้ส่งและผู้รับ ระบุน้ำหนักและขนาดโดยประมาณ จากนั้นยืนยันสร้างรายการ นำพัสดุไปลงทะเบียนและชั่งน้ำหนักที่สาขาไปรษณีย์ไทยตามใบปะหน้าที่พิมพ์จากระบบ",
  },
  {
    id: "when-pay",
    question: "ต้องชำระเงินเมื่อไหร่?",
    answer:
      "ยอดชำระจะแสดงหลังจากไปรษณีย์ไทยยืนยันราคาจริงผ่านระบบ ซึ่งจะเกิดขึ้นหลังจากพัสดุถูกลงทะเบียนและชั่งน้ำหนักที่สาขาแล้ว จากนั้นชำระได้ที่เมนู ยอดชำระ หรือจากหน้ารายละเอียดพัสดุ",
  },
  {
    id: "price-diff",
    question: "ทำไมราคาจริงไม่ตรงกับที่ประมาณไว้?",
    answer:
      "ราคาตอนสร้างรายการเป็นการประมาณการจากน้ำหนักและขนาดที่คุณกรอก ราคาสุดท้ายคิดจากน้ำหนักจริงที่ชั่งที่ไปรษณีย์ หากน้ำหนักหรือขนาดต่างจากที่ระบุ ยอดชำระจึงอาจเปลี่ยนได้",
  },
  {
    id: "track",
    question: "ติดตามสถานะพัสดุได้ที่ไหน?",
    answer:
      "ไปที่เมนู พัสดุ เพื่อดูรายการทั้งหมด ค้นหาด้วยเลขพัสดุหรือบาร์โค้ด แล้วแตะเข้าไปดูความคืบหน้าการจัดส่งและประวัติสถานะจากไปรษณีย์ไทย",
  },
  {
    id: "otp",
    question: "ทำไมต้องยืนยันเบอร์โทรด้วย OTP?",
    answer:
      "เพื่อยืนยันว่าเบอร์โทรเป็นของคุณจริง ใช้ติดต่อเกี่ยวกับพัสดุและการชำระเงิน รหัส OTP จะส่งทาง SMS เมื่อลงทะเบียนหรือเปลี่ยนเบอร์โทรในระบบ",
  },
  {
    id: "label",
    question: "พิมพ์ใบปะหน้าพัสดุอย่างไร?",
    answer:
      "เปิดหน้ารายละเอียดพัสดุ แล้วแตะ พิมพ์ใบปะหน้า ระบบจะเปิดไฟล์ PDF ให้พิมพ์หรือบันทึก นำไปติดกับพัสดุก่อนนำไปส่งที่ไปรษณีย์",
  },
] as const;

function FaqAccordion() {
  const [openId, setOpenId] = useState<string | null>(FAQ_ITEMS[0]?.id ?? null);

  return (
    <div className="divide-y divide-slate-100 rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
      {FAQ_ITEMS.map((item) => {
        const open = openId === item.id;
        return (
          <div key={item.id}>
            <button
              type="button"
              id={`faq-${item.id}`}
              aria-expanded={open}
              aria-controls={`faq-panel-${item.id}`}
              onClick={() => setOpenId((cur) => (cur === item.id ? null : item.id))}
              className="flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50/80"
            >
              <span className="text-sm font-medium text-slate-900">{item.question}</span>
              <span
                className={`mt-0.5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
                aria-hidden
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24">
                  <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>
            {open ? (
              <div
                id={`faq-panel-${item.id}`}
                role="region"
                aria-labelledby={`faq-${item.id}`}
                className="border-t border-slate-100 px-4 pb-4 pt-1"
              >
                <p className="text-sm leading-relaxed text-slate-600">{item.answer}</p>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default function HelpPage() {
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
          <h1 className="text-3xl font-bold leading-none">ช่วยเหลือ</h1>
          <p className="mt-1 text-sm text-white/80">ติดต่อทีมงานหรือดูคำถามที่พบบ่อย</p>
        </div>
      </section>

      <section className="-mt-8 px-6">
        <div className="mx-auto w-full max-w-lg space-y-4">
          <article className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm font-semibold text-slate-900">ต้องการความช่วยเหลือ?</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              หากต้องการสอบถามหรือแจ้งปัญหา ติดต่อฝ่ายบริการลูกค้าได้ที่{" "}
              <a
                href={CUSTOMER_SERVICE_LINE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[#2726F5] underline-offset-2 hover:underline"
              >
                LINE QUICKLOAD
              </a>{" "}
              ไลน์นี้ได้เลย หรือโทร{" "}
              <a href={`tel:${CUSTOMER_SERVICE_PHONE_TEL}`} className="font-medium text-[#2726F5] underline-offset-2 hover:underline">
                {CUSTOMER_SERVICE_PHONE}
              </a>
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={CUSTOMER_SERVICE_LINE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#06C755]/30 bg-[#06C755]/10 px-3 py-2 text-xs font-medium text-[#059669] transition hover:bg-[#06C755]/15"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
                </svg>
                แอด LINE QUICKLOAD
              </a>
              <a
                href={`tel:${CUSTOMER_SERVICE_PHONE_TEL}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-white"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" aria-hidden>
                  <path
                    d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                โทร {CUSTOMER_SERVICE_PHONE}
              </a>
            </div>
          </article>

          <div>
            <h2 className="mb-2 px-1 text-sm font-semibold text-slate-800">คำถามที่พบบ่อย</h2>
            <FaqAccordion />
          </div>

          <p className="px-1 text-center text-xs text-slate-500">
            ดูขั้นตอนการใช้งานเพิ่มเติมได้ที่{" "}
            <Link href="/manual" className="font-medium text-[#2726F5] underline-offset-2 hover:underline">
              คู่มือการใช้งาน
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
