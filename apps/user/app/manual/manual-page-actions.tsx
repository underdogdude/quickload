"use client";

import Link from "next/link";
import { SendLink } from "@/lib/send-access-ui";

export function ManualPageActions() {
  return (
    <div className="grid grid-cols-2 gap-3 pt-1">
      <SendLink
        className="inline-flex items-center justify-center rounded-lg bg-[#2726F5] px-4 py-2.5 text-sm font-medium text-white"
      >
        เริ่มส่งพัสดุ
      </SendLink>
      <Link
        href="/parcels"
        className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700"
      >
        ดูรายการพัสดุ
      </Link>
    </div>
  );
}
