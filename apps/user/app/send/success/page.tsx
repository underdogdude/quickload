"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SuccessInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const parcelId = searchParams.get("parcelId") ?? "";
  const trackingId = searchParams.get("trackingId") ?? "";

  return (
    <main className="min-h-screen bg-slate-100 pb-36">
      <section className="bg-[#2726F5] px-6 pb-14 pt-10 text-white">
        <div className="mx-auto w-full max-w-lg">
          <button
            type="button"
            onClick={() => router.push("/send")}
            className="mb-3 inline-flex items-center gap-1 rounded-full border border-white/40 px-3 py-1.5 text-xs font-medium text-white/95"
          >
            <span aria-hidden>←</span>
            <span>กลับหน้าส่งพัสดุ</span>
          </button>
          <h1 className="text-3xl font-bold leading-none">สร้างออเดอร์สำเร็จ</h1>
          <p className="mt-1 text-sm text-white/80">สามารถดำเนินการชำระเงินต่อได้ทันที</p>
        </div>
      </section>

      <section className="-mt-8 px-6">
        <div className="mx-auto w-full max-w-lg rounded-lg bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">เลขออเดอร์</p>
          <p className="text-sm font-semibold text-slate-900">{parcelId || "-"}</p>
          <p className="mt-3 text-xs text-slate-500">Tracking (ชั่วคราว)</p>
          <p className="text-sm font-semibold text-slate-900">{trackingId || "-"}</p>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 bg-[#ECECEC] px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 shadow-[0_-6px_20px_rgba(15,23,42,0.08)]">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-2">
          <Link
            href="/payment"
            className="w-full rounded-full bg-[#2726F5] px-6 py-3 text-center text-base font-semibold text-white shadow-[0_6px_14px_rgba(39,38,245,0.35)]"
          >
            ไปชำระเงิน
          </Link>
          <Link href="/parcels" className="w-full rounded-full border border-slate-300 bg-white px-6 py-3 text-center text-sm font-medium text-slate-700">
            ดูรายการพัสดุของฉัน
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function SendSuccessPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-100 p-6">
          <p className="text-sm text-slate-600">กำลังโหลด...</p>
        </main>
      }
    >
      <SuccessInner />
    </Suspense>
  );
}

