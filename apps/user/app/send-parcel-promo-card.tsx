"use client";

import Link from "next/link";
import { SendLink } from "@/lib/send-access-ui";

const PRIMARY_SERVICE_CARD_CLASS =
  "group relative flex min-h-40 select-none flex-col justify-between overflow-hidden rounded-lg bg-white p-4 opacity-100 shadow-sm ring-1 ring-slate-200 transition-[background-color,box-shadow,transform] duration-200 [-webkit-tap-highlight-color:transparent] hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0802b8] active:scale-[0.99] active:bg-indigo-100 active:opacity-100";

const PROMO_CARD_IMAGE_CLASS =
  "pointer-events-none absolute bottom-0 right-2 h-24 w-24 object-contain transition-transform duration-200 group-hover:-translate-y-0.5";

export function SendParcelPromoCard() {
  return (
    <div className="home-primary-services grid grid-cols-2 gap-3">
      <SendLink className={PRIMARY_SERVICE_CARD_CLASS}>
        <div className="relative z-10">
          <h2 className="text-lg font-medium text-slate-900">ส่งพัสดุ</h2>
          <p className="text-sm leading-5 text-slate-400">ลงทะเบียนพัสดุใหม่</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/mr-quickload.png"
          alt=""
          width={96}
          height={96}
          loading="eager"
          fetchPriority="high"
          className={PROMO_CARD_IMAGE_CLASS}
          aria-hidden
        />
      </SendLink>

      <Link
        href="/pickup"
        prefetch
        className={PRIMARY_SERVICE_CARD_CLASS}
      >
        <span className="absolute right-0 top-0 z-10 inline-flex items-center gap-0.5 rounded-none rounded-bl-lg bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold leading-none tracking-wide text-white shadow-sm">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="h-2.5 w-2.5"
            aria-hidden
          >
            <path d="M8 16c3.314 0 6-2 6-5.5 0-1.5-.5-4-2.5-6 .25 1.5-1.25 2-1.25 2C11 4 9 .5 6 0c.357 2 .5 4-2 6-1.25 1-2 2.729-2 4.5C2 14 4.686 16 8 16m0-1c-1.657 0-3-1-3-2.75 0-.75.25-2 1.25-3C6.125 10 7 10.5 7 10.5c-.375-1.25.5-3.25 2-3.5-.179 1-.25 2 1 3 .625.5 1 1.364 1 2.25C11 14 9.657 15 8 15" />
          </svg>
          HOT
        </span>
        <div className="relative z-10">
          <h2 className="text-lg font-medium text-slate-900">เรียกรถเข้ารับ</h2>
          <p className="text-sm leading-5 text-slate-400">มารับถึงที่ แค่ 1 ชิ้นก็ได้</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/truck.png"
          alt=""
          width={952}
          height={570}
          loading="eager"
          className="pointer-events-none absolute bottom-2 right-2 h-auto w-28 object-contain transition-transform duration-200 group-hover:-translate-y-0.5"
          aria-hidden
        />
      </Link>
    </div>
  );
}
