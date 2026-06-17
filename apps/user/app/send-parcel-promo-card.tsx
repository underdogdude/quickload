"use client";

import { SendLink } from "@/lib/send-access-ui";

export function SendParcelPromoCard() {
  return (
    <SendLink
      className="flex items-center justify-between rounded-lg bg-white px-5 py-5 shadow-sm ring-1 ring-slate-200 transition hover:border-[#2726F5]"
    >
      <div>
        <h3 className="text-xl font-medium">ส่งพัสดุ</h3>
        <p className="mt-1 text-xs text-slate-500">เริ่มลงทะเบียนพัสดุใหม่</p>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/truck.png"
        alt="ส่งพัสดุ"
        width={120}
        height={120}
        loading="eager"
        fetchPriority="high"
        className="object-contain"
      />
    </SendLink>
  );
}
