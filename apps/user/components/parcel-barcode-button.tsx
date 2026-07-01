"use client";

import { parcelBarcodeDataUrl } from "@/lib/parcel-scan-media";
import { useEffect, useState } from "react";

type ParcelBarcodeButtonProps = {
  parcelCode: string;
  className?: string;
};

function BarcodeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M4 6v12M7 6v12M10 6v12M13 6v12M16 6v12M20 6v12M5 6h14M5 18h14"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ParcelBarcodeButton({ parcelCode, className = "" }: ParcelBarcodeButtonProps) {
  const [open, setOpen] = useState(false);
  const [barcode, setBarcode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const code = parcelCode.trim();

  useEffect(() => {
    if (!open) {
      setBarcode(null);
      setLoading(false);
      setError(null);
      return;
    }
    if (!code || code === "-") {
      setError("ไม่มีเลขพัสดุสำหรับสร้างบาร์โค้ด");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setBarcode(null);
    try {
      const dataUrl = parcelBarcodeDataUrl(code);
      if (!cancelled) {
        setBarcode(dataUrl);
        setLoading(false);
      }
    } catch {
      if (!cancelled) {
        setError("สร้างบาร์โค้ดไม่สำเร็จ");
        setLoading(false);
      }
    }
    return () => {
      cancelled = true;
    };
  }, [open, code]);

  return (
    <>
      <button
        type="button"
        aria-label="แสดงบาร์โค้ด"
        onClick={() => setOpen(true)}
        className={
          className ||
          "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50"
        }
      >
        <BarcodeIcon />
      </button>

      {open ? (
        <div className="fixed inset-0 z-40 !mt-0 bg-black/40 px-6 py-10" onClick={() => setOpen(false)}>
          <div
            className="mx-auto mt-24 w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900">BARCODE</h3>
            <p className="mt-1 text-xs text-slate-500">สแกนเพื่ออ่านเลขพัสดุ</p>
            <div className="mt-4 flex min-h-[11rem] items-center justify-center rounded-lg border border-slate-200 bg-white p-3">
              {loading ? (
                <span className="text-sm text-slate-500">กำลังสร้าง…</span>
              ) : error ? (
                <span className="px-2 text-center text-sm text-rose-600">{error}</span>
              ) : barcode ? (
                // eslint-disable-next-line @next/next/no-img-element -- data URL from jsbarcode
                <img src={barcode} alt="" className="max-h-52 w-full object-contain" />
              ) : null}
            </div>
            <p className="mt-3 text-xs text-slate-600">เลขพัสดุ: {code || "—"}</p>
            <button
              type="button"
              className="mt-4 w-full rounded-lg bg-[#2726F5] px-4 py-2 text-sm font-medium text-white"
              onClick={() => setOpen(false)}
            >
              ปิด
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
