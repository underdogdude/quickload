"use client";

import Link from "next/link";
import { parcelBarcodeDataUrl, parcelQrDataUrl } from "@/lib/parcel-scan-media";
import { useEffect, useMemo, useState } from "react";

type ParcelRow = {
  id: string;
  trackingId: string;
  barcode: string | null;
  status: string;
  destination: string | null;
  isPaid: boolean;
  createdAt: string;
  senderProvince: string | null;
  senderName: string | null;
  senderPhone: string | null;
  recipientProvince: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
};

function getStatusLabel(status: string) {
  if (status === "draft") return "แบบร่าง";
  if (status === "pending_payment") return "รอชำระเงิน";
  if (status === "paid") return "ชำระแล้ว";
  if (status === "registered") return "ลงทะเบียนแล้ว";
  if (status === "in_transit") return "อยู่ระหว่างขนส่ง";
  if (status === "delivered") return "จัดส่งสำเร็จ";
  if (status === "failed") return "จัดส่งไม่สำเร็จ";
  if (status === "canceled") return "ยกเลิกแล้ว";
  return status;
}

function getStatusClass(status: string) {
  if (status === "draft") return "bg-amber-100 text-amber-800";
  if (status === "pending_payment") return "bg-rose-100 text-rose-700";
  if (status === "paid") return "bg-emerald-100 text-emerald-700";
  if (status === "registered") return "bg-indigo-100 text-indigo-700";
  if (status === "in_transit") return "bg-sky-100 text-sky-800";
  if (status === "delivered") return "bg-emerald-100 text-emerald-800";
  if (status === "failed") return "bg-rose-100 text-rose-800";
  if (status === "canceled") return "bg-slate-200 text-slate-600";
  return "bg-slate-100 text-slate-700";
}

function getPaymentStatusLabel(isPaid: boolean) {
  return isPaid ? "ชำระแล้ว" : "ยังไม่ชำระ";
}

function getPaymentStatusClass(isPaid: boolean) {
  return isPaid ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700";
}

function getTimelineStatusClass(status: string) {
  if (status === "draft") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "pending_payment") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "paid") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "registered") return "border-indigo-200 bg-indigo-50 text-indigo-700";
  if (status === "in_transit") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "delivered") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "failed") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "canceled") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function getStatusIconCircleClass() {
  return "text-[#2726F5]";
}

function formatCreatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function StatusCircleIcon({ status }: { status: string }) {
  if (status === "draft") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" aria-hidden>
        <path d="M8 4h8M8 20h8M6 8h12M6 12h12M6 16h8" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      </svg>
    );
  }
  if (status === "registered") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" aria-hidden>
        <rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M8 9h8M8 13h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (status === "delivered") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" aria-hidden>
        <path d="m5 13 4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === "failed") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" aria-hidden>
        <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (status === "in_transit") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" aria-hidden>
        <path d="M3 7h12v8H3V7Zm12 2h3l3 3v3h-6V9Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="7" cy="17" r="1.6" fill="currentColor" />
        <circle cx="17" cy="17" r="1.6" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/** Thailand Post–style payload for scanners (barcode / tracking e.g. WB…TH). */
function parcelScanText(p: ParcelRow): string {
  return p.barcode?.trim() || p.trackingId.trim() || "";
}

function formatThaiDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const datePart = date.toLocaleDateString("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timePart = date.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${datePart} ${timePart} น.`;
}

export function ParcelsListClient({
  items,
  error,
  initialQuery = "",
}: {
  items: ParcelRow[];
  error: string | null;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [activeStatus, setActiveStatus] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [placeholderModal, setPlaceholderModal] = useState<{
    type: "qr" | "barcode";
    parcelCode: string;
  } | null>(null);
  const [scanModalMedia, setScanModalMedia] = useState<{
    qr: string | null;
    barcode: string | null;
    loading: boolean;
    error: string | null;
  }>({ qr: null, barcode: null, loading: false, error: null });
  const normalizedQuery = query.trim().toLowerCase();

  useEffect(() => {
    if (!placeholderModal) {
      setScanModalMedia({ qr: null, barcode: null, loading: false, error: null });
      return;
    }
    const text = placeholderModal.parcelCode.trim();
    if (!text || text === "-") {
      setScanModalMedia({
        qr: null,
        barcode: null,
        loading: false,
        error: "ไม่มีเลขพัสดุสำหรับสร้างคิวอาร์โค้ด / บาร์โค้ด",
      });
      return;
    }
    let cancelled = false;
    setScanModalMedia({ qr: null, barcode: null, loading: true, error: null });
    (async () => {
      try {
        const [qr, bc] = await Promise.all([
          parcelQrDataUrl(text),
          Promise.resolve().then(() => parcelBarcodeDataUrl(text)),
        ]);
        if (!cancelled) {
          setScanModalMedia({ qr, barcode: bc, loading: false, error: null });
        }
      } catch {
        if (!cancelled) {
          setScanModalMedia({
            qr: null,
            barcode: null,
            loading: false,
            error: "สร้าง QR / บาร์โค้ดไม่สำเร็จ",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [placeholderModal]);

  const statusTabs = useMemo(() => {
    const seen = new Set<string>();
    const tabs: string[] = [];
    for (const item of items) {
      if (seen.has(item.status)) continue;
      seen.add(item.status);
      tabs.push(item.status);
    }
    return tabs;
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((p) => {
      const statusMatched = activeStatus === "all" || p.status === activeStatus;
      if (!statusMatched) return false;
      if (!normalizedQuery) return true;
      const tracking = p.trackingId.toLowerCase();
      const barcode = (p.barcode ?? "").toLowerCase();
      return tracking.includes(normalizedQuery) || barcode.includes(normalizedQuery);
    });
  }, [items, normalizedQuery, activeStatus]);

  const hasSearch = normalizedQuery.length > 0;
  const copyTracking = async (parcelId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(parcelId);
      window.setTimeout(() => {
        setCopiedId((current) => (current === parcelId ? null : current));
      }, 1200);
    } catch {
      // Ignore clipboard failure silently; UI remains usable.
    }
  };

  return (
    <div className="mx-auto w-full max-w-lg space-y-3">
      <div className="mb-5 rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-200">
        <label className="sr-only" htmlFor="parcel-search">
          ค้นหาเลขพัสดุหรือบาร์โค้ด
        </label>
        <div className="relative flex items-center gap-2">
          <span className="pointer-events-none absolute left-3 text-slate-400" aria-hidden>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <input
            id="parcel-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหา Tracking number / Barcode"
            className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-400"
          />
          {hasSearch ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="ล้างคำค้นหา"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" aria-hidden>
                <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          ) : null}
        </div>
        <div className="mt-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="inline-flex min-w-max items-center gap-2 whitespace-nowrap">
            <button
              type="button"
              onClick={() => setActiveStatus("all")}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                activeStatus === "all"
                  ? "bg-[#2726F5] text-white"
                  : "border border-slate-300 bg-white text-slate-700"
              }`}
            >
              ทั้งหมด
            </button>
            {statusTabs.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setActiveStatus(status)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  activeStatus === status
                    ? "bg-[#2726F5] text-white"
                    : "border border-slate-300 bg-white text-slate-700"
                }`}
              >
                {getStatusLabel(status)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          {error}
        </div>
      ) : null}

      {filteredItems.map((p) => (
        <article key={p.id} className="relative overflow-visible rounded-lg bg-white px-5 py-5 shadow-sm ring-1 ring-slate-200">
          <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            <div className="min-w-0">
              <p className="text-xs font-normal text-slate-400">หมายเลขพัสดุ</p>
              <div className="flex items-center gap-1">
                <div className="min-w-0">
                  <p className="truncate text-lg font-medium leading-tight text-[#2726F5]">
                    {p.barcode ?? "-"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => copyTracking(p.id, p.barcode ?? "-")}
                  aria-label="คัดลอกหมายเลขพัสดุ"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                >
                  {copiedId === p.id ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" aria-hidden>
                      <path d="m5 13 4 4L19 7" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" aria-hidden>
                      <rect x="9" y="3" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
                      <rect x="3" y="7" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <span
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-full ${getStatusIconCircleClass()}`}
              style={{
                backgroundColor: "rgba(39, 38, 245, 0.12)",
              }}
              aria-label={getStatusLabel(p.status)}
              title={getStatusLabel(p.status)}
            >
              <StatusCircleIcon status={p.status} />
            </span>
          </div>

          <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-start gap-4 text-center">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-slate-900">
                {p.senderProvince ?? p.destination ?? "-"}
              </p>
              <p className="mt-1 truncate text-xs text-slate-500">{p.senderName ?? "-"}</p>
              <p className="mt-1 truncate text-xs text-slate-400">{p.senderPhone ?? "-"}</p>
            </div>
            <div className="flex items-center justify-center pt-3">
              <div className="flex w-full max-w-[220px] items-center gap-2">
                <div className="h-px flex-1 bg-slate-200" />
                <div className="flex shrink-0 flex-col items-center">
                  <span
                    className={`inline-flex rounded-full border px-2 py-[2px] text-[10px] font-medium ${getTimelineStatusClass(
                      p.status,
                    )}`}
                  >
                    {getStatusLabel(p.status)}
                  </span>
                  <p className="mt-1 text-[10px] font-normal text-slate-400">{formatThaiDateTime(p.createdAt)}</p>
                </div>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-slate-900">
                {p.recipientProvince ?? p.destination ?? "-"}
              </p>
              <p className="mt-1 truncate text-xs text-slate-500">{p.recipientName ?? "-"}</p>
              <p className="mt-1 truncate text-xs text-slate-400">{p.recipientPhone ?? "-"}</p>
            </div>
          </div>

          <div className="my-4 border-t border-slate-200" />

          <div className="flex items-center justify-between gap-4 text-slate-400">
            {p.status === "pending_payment" && !p.isPaid ? (
              <Link
                href={`/pay/${p.id}`}
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#2726F5] px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" aria-hidden>
                  <path d="M3 7h18v10H3V7Zm0 4h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                ชำระเงิน
              </Link>
            ) : (
              <span className={`shrink-0 rounded-full px-4 py-1 text-xs font-normal ${getPaymentStatusClass(p.isPaid)}`}>
                {getPaymentStatusLabel(p.isPaid)}
              </span>
            )}
            <div className="flex items-center gap-4">
              <Link href={`/parcels/${p.id}`} aria-label="พิมพ์ใบปะหน้า" className="transition hover:text-slate-600">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24">
                  <path d="M7 8V4h10v4M7 16h10v4H7v-4Zm-2 0H4a1 1 0 0 1-1-1v-4a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v4a1 1 0 0 1-1 1h-1" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
              <button
                type="button"
                aria-label="แสดงคิวอาร์โค้ด"
                className="transition hover:text-slate-600"
                onClick={() =>
                  setPlaceholderModal({
                    type: "qr",
                    parcelCode: parcelScanText(p),
                  })
                }
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24">
                  <path d="M4 4h6v6H4V4Zm0 10h6v6H4v-6Zm10-10h6v6h-6V4Zm6 12v4h-4m-2 0v-2m0-4v-2m4 2h2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="แสดงบาร์โค้ด"
                className="transition hover:text-slate-600"
                onClick={() =>
                  setPlaceholderModal({
                    type: "barcode",
                    parcelCode: parcelScanText(p),
                  })
                }
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" viewBox="0 0 24 24">
                  <path
                    d="M4 6v12M7 6v12M10 6v12M13 6v12M16 6v12M20 6v12M5 6h14M5 18h14"
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        </article>
      ))}

      {filteredItems.length === 0 && !error ? (
        <div className="rounded-lg bg-white p-5 text-center shadow-sm">
          {hasSearch ? (
            <>
              <p className="text-sm font-medium text-slate-700">ไม่พบพัสดุที่ค้นหา</p>
              <p className="mt-1 text-xs text-slate-500">ลองค้นหาด้วย Tracking number หรือ Barcode อื่น</p>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="mt-3 inline-flex rounded-full border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700"
              >
                ล้างการค้นหา
              </button>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-700">ยังไม่มีพัสดุ</p>
              <p className="mt-1 text-xs text-slate-500">เริ่มสร้างรายการส่งพัสดุใหม่ได้ที่หน้าส่งพัสดุ</p>
              <Link
                href="/send"
                className="mt-3 inline-flex rounded-full bg-[#2726F5] px-4 py-2 text-xs font-medium text-white"
              >
                ไปหน้าส่งพัสดุ
              </Link>
            </>
          )}
        </div>
      ) : null}

      {placeholderModal ? (
        <div className="fixed inset-0 z-40 !mt-0 bg-black/40 px-6 py-10" onClick={() => setPlaceholderModal(null)}>
          <div
            className="mx-auto mt-24 w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900">
              {placeholderModal.type === "qr" ? "QR CODE" : "BARCODE"}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              สแกนเพื่ออ่านเลขพัสดุ (เช่นรูปแบบ WB…TH)
            </p>
            <div className="mt-4 flex min-h-[11rem] items-center justify-center rounded-lg border border-slate-200 bg-white p-3">
              {scanModalMedia.loading ? (
                <span className="text-sm text-slate-500">กำลังสร้าง…</span>
              ) : scanModalMedia.error ? (
                <span className="px-2 text-center text-sm text-rose-600">{scanModalMedia.error}</span>
              ) : placeholderModal.type === "qr" && scanModalMedia.qr ? (
                // eslint-disable-next-line @next/next/no-img-element -- data URL from qrcode
                <img src={scanModalMedia.qr} alt="" className="max-h-52 w-auto max-w-full" />
              ) : placeholderModal.type === "barcode" && scanModalMedia.barcode ? (
                // eslint-disable-next-line @next/next/no-img-element -- data URL from jsbarcode
                <img src={scanModalMedia.barcode} alt="" className="max-h-52 w-full object-contain" />
              ) : null}
            </div>
            <p className="mt-3 text-xs text-slate-600">เลขพัสดุ: {placeholderModal.parcelCode || "—"}</p>
            <button
              type="button"
              className="mt-4 w-full rounded-lg bg-[#2726F5] px-4 py-2 text-sm font-medium text-white"
              onClick={() => setPlaceholderModal(null)}
            >
              ปิด
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
