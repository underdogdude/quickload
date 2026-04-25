"use client";

import Image from "next/image";
import Link from "next/link";
import successIllustration from "../../../public/success.png";
import { parcelBarcodeDataUrl, parcelQrDataUrl } from "@/lib/parcel-scan-media";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";

type ParcelApi = {
  id: string;
  trackingId: string;
  barcode: string | null;
  destination: string | null;
  weightKg: string | null;
  size: string | null;
  price: string | null;
  status: string;
};

type OrderApi = {
  barcode: string | null;
  smartpostTrackingcode: string | null;
  productWeight: string | null;
  productInbox: string | null;
  shipperName: string | null;
  shipperMobile: string | null;
  shipperAddress: string | null;
  shipperSubdistrict: string | null;
  shipperDistrict: string | null;
  shipperProvince: string | null;
  shipperZipcode: string | null;
  cusName: string | null;
  cusTel: string | null;
  cusAdd: string | null;
  cusSub: string | null;
  cusAmp: string | null;
  cusProv: string | null;
  cusZipcode: string | null;
};
type ScanTab = "qr" | "barcode";

function parseParcelSize(size: string | null): { dimensions: string; parcelType: string } {
  if (!size?.trim()) return { dimensions: "-", parcelType: "-" };
  const sep = " · ";
  const idx = size.lastIndexOf(sep);
  if (idx === -1) return { dimensions: size.trim(), parcelType: "-" };
  return {
    dimensions: size.slice(0, idx).trim() || "-",
    parcelType: size.slice(idx + sep.length).trim() || "-",
  };
}

function formatWeightGrams(parcel: ParcelApi | null, order: OrderApi | null): string {
  if (order?.productWeight?.trim()) {
    const g = Number(order.productWeight);
    if (Number.isFinite(g)) return `${g.toLocaleString("th-TH")} กรัม`;
  }
  if (parcel?.weightKg) {
    const kg = Number(parcel.weightKg);
    if (Number.isFinite(kg)) return `${Math.round(kg * 1000).toLocaleString("th-TH")} กรัม`;
  }
  return "-";
}

function formatSizeCm(dimensions: string): string {
  if (!dimensions || dimensions === "-") return "-";
  if (dimensions.includes("ซม")) return dimensions;
  return `${dimensions} ซม.`;
}

function CopyIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={props.className} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  );
}

function CheckIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={props.className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
    </svg>
  );
}

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-slate-100 py-3 last:border-b-0">
      <p className="w-[4.5rem] shrink-0 text-xs leading-relaxed text-slate-500">{label}</p>
      <div className="min-w-0 flex-1 text-sm font-semibold leading-relaxed text-slate-900">{children}</div>
    </div>
  );
}

function SuccessInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const parcelId = searchParams.get("parcelId") ?? "";
  const trackingIdParam = searchParams.get("trackingId") ?? "";

  const [parcel, setParcel] = useState<ParcelApi | null>(null);
  const [order, setOrder] = useState<OrderApi | null>(null);
  const [loading, setLoading] = useState(Boolean(parcelId));
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [scanTab, setScanTab] = useState<ScanTab>("qr");
  const [scanQrUrl, setScanQrUrl] = useState<string | null>(null);
  const [scanBarcodeUrl, setScanBarcodeUrl] = useState<string | null>(null);
  const [scanCodesLoading, setScanCodesLoading] = useState(false);
  const [scanCodesError, setScanCodesError] = useState<string | null>(null);

  useEffect(() => {
    if (!parcelId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/parcels/${encodeURIComponent(parcelId)}`);
        const json = (await res.json()) as {
          ok?: boolean;
          data?: { parcel?: ParcelApi; order?: OrderApi | null };
          error?: string;
        };
        if (cancelled) return;
        if (res.status === 401) {
          router.replace("/entry");
          return;
        }
        if (!res.ok || !json.ok || !json.data?.parcel) {
          setError(json.error ?? "โหลดข้อมูลพัสดุไม่สำเร็จ");
          return;
        }
        setParcel(json.data.parcel);
        setOrder(json.data.order ?? null);
      } catch {
        if (!cancelled) setError("โหลดข้อมูลพัสดุไม่สำเร็จ");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [parcelId, router]);

  /** Thailand Post / parcel barcode — shown as หมายเลขพัสดุ */
  const barcode = order?.barcode?.trim() || parcel?.barcode?.trim() || "";
  /** Smartpost reference (e.g. NO48-…) — subtle “Reference code” row */
  const smartpostRef = order?.smartpostTrackingcode?.trim() || "";
  const parcelTrackingId = parcel?.trackingId?.trim() || trackingIdParam.trim() || "";

  const primaryParcelDisplay = barcode || "-";

  const referenceCode =
    smartpostRef && smartpostRef !== barcode
      ? smartpostRef
      : !smartpostRef && parcelTrackingId && parcelTrackingId !== barcode
        ? parcelTrackingId
        : "";

  /** Thailand Post–style tracking on the label (e.g. WB…TH) — must match what scanners expect. */
  const scanPayload = useMemo(() => {
    const b = barcode.trim();
    if (b) return b;
    const t = parcelTrackingId.trim();
    if (t) return t;
    return referenceCode.trim();
  }, [barcode, parcelTrackingId, referenceCode]);

  useEffect(() => {
    if (!scanPayload || loading) {
      setScanQrUrl(null);
      setScanBarcodeUrl(null);
      setScanCodesLoading(false);
      setScanCodesError(null);
      return;
    }
    let cancelled = false;
    setScanCodesLoading(true);
    setScanCodesError(null);
    (async () => {
      try {
        const [qr, bcDataUrl] = await Promise.all([
          parcelQrDataUrl(scanPayload),
          Promise.resolve().then(() => parcelBarcodeDataUrl(scanPayload)),
        ]);
        if (!cancelled) {
          setScanQrUrl(qr);
          setScanBarcodeUrl(bcDataUrl);
        }
      } catch {
        if (!cancelled) {
          setScanQrUrl(null);
          setScanBarcodeUrl(null);
          setScanCodesError("สร้าง QR / บาร์โค้ดไม่สำเร็จ");
        }
      } finally {
        if (!cancelled) setScanCodesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scanPayload, loading]);

  async function copyTracking() {
    try {
      const toCopy = barcode || referenceCode || parcelTrackingId;
      if (!toCopy || toCopy === "-") return;
      await navigator.clipboard.writeText(toCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — silently ignore
    }
  }

  const { dimensions, parcelType } = useMemo(
    () => parseParcelSize(parcel?.size ?? null),
    [parcel?.size],
  );
  const sizeDisplay = formatSizeCm(dimensions);
  const typeDisplay = useMemo(() => {
    const fromParcel = parcelType !== "-" ? parcelType : "";
    const fromOrder = order?.productInbox?.trim() ?? "";
    if (fromOrder && fromParcel && fromParcel !== fromOrder) return `${fromParcel} (${fromOrder})`;
    if (fromOrder) return fromOrder;
    if (fromParcel) return fromParcel;
    return "-";
  }, [order?.productInbox, parcelType]);

  const shipperLine1 =
    order?.shipperName || order?.shipperMobile
      ? [order?.shipperName, order?.shipperMobile].filter(Boolean).join(" | ")
      : null;
  const shipperLine2 = order
    ? [order.shipperAddress, order.shipperSubdistrict, order.shipperDistrict, order.shipperProvince, order.shipperZipcode]
        .filter(Boolean)
        .join(", ")
    : "";

  const recipientLine1 =
    order?.cusName || order?.cusTel ? [order?.cusName, order?.cusTel].filter(Boolean).join(" | ") : null;
  const recipientLine2 = order
    ? [order.cusAdd, order.cusSub, order.cusAmp, order.cusProv, order.cusZipcode].filter(Boolean).join(", ")
    : "";

  const labelPdfUrl = parcelId ? `/api/parcels/${encodeURIComponent(parcelId)}/label.pdf` : "";

  function onDownloadLabelPdf() {
    if (!labelPdfUrl) return;
    const a = document.createElement("a");
    a.href = labelPdfUrl;
    a.download = `parcel-label-${(barcode || referenceCode || parcelTrackingId || "label").replace(/[^\w-]+/g, "_")}.pdf`;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.click();
  }

  function onOpenLabelPrintTab() {
    if (!labelPdfUrl) return;
    window.open(labelPdfUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <main className="min-h-screen bg-slate-100 pb-40 print:pb-0">
      <section className="relative bg-[#2726F5] px-5 pb-24 pt-8 text-white print:hidden">
        <Link
          href="/"
          aria-label="กลับหน้าหลัก"
          className="absolute right-1 top-1 p-1 text-white hover:text-white/90"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-8 w-8" aria-hidden>
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </Link>
        <div className="mx-auto w-full max-w-lg">
          <h1 className="text-center text-2xl font-bold leading-tight">สร้างพัสดุสำเร็จ</h1>
          <p className="mt-2 text-center text-sm text-white/80">สามารถดำเนินการชำระเงินต่อได้ทันที</p>
        </div>
      </section>

      <div className="relative z-10 -mt-[80px] flex justify-center px-5 print:hidden">
        <Image
          src={successIllustration}
          alt=""
          width={140}
          height={140}
          priority
          className="drop-shadow-lg"
        />
      </div>

      <section className="relative z-11 -mt-[80px] px-5 print:mt-4">
        <div className="mx-auto w-full max-w-lg space-y-4">
          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
          ) : null}

          {/* Tracking + PromptPay QR */}
          <div className="rounded-2xl bg-white p-5 shadow-md ring-1 ring-slate-200/80 print:shadow-none pt-20">
            {loading ? (
              <div className="space-y-4">
                <div className="mx-auto h-4 w-24 animate-pulse rounded bg-slate-200" />
                <div className="mx-auto h-8 w-48 max-w-full animate-pulse rounded bg-slate-200" />
                <div className="mx-auto h-56 w-56 animate-pulse rounded-lg bg-slate-100" />
              </div>
            ) : (
              <>
                <div className="text-center">
                  <p className="text-xs font-medium text-slate-500">หมายเลขพัสดุ</p>
                  <div className="mt-2 flex items-center justify-center gap-2">
                    <span aria-hidden className="h-10 w-10 shrink-0" />
                    <p className="max-w-full break-all text-center text-2xl font-medium tracking-tight text-slate-900">
                      {primaryParcelDisplay}
                    </p>
                    <button
                      type="button"
                      onClick={copyTracking}
                      disabled={!barcode && !referenceCode && !parcelTrackingId}
                      aria-label={copied ? "คัดลอกแล้ว" : "คัดลอกหมายเลขพัสดุ"}
                      className="shrink-0 rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:pointer-events-none disabled:opacity-40"
                    >
                      {copied ? <CheckIcon className="h-6 w-6 text-emerald-500" /> : <CopyIcon className="h-6 w-6" />}
                    </button>
                  </div>
                </div>

                <hr className="my-5 border-slate-100" />

                <div className="flex flex-col items-center">
                  <div className="mb-3 grid w-full max-w-[14rem] grid-cols-2 rounded-full bg-slate-100 p-1 text-[11px] font-medium">
                    <button
                      type="button"
                      onClick={() => setScanTab("qr")}
                      className={`rounded-full px-3 py-1.5 transition-colors ${
                        scanTab === "qr" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                      }`}
                      aria-pressed={scanTab === "qr"}
                    >
                      QR CODE
                    </button>
                    <button
                      type="button"
                      onClick={() => setScanTab("barcode")}
                      className={`rounded-full px-3 py-1.5 transition-colors ${
                        scanTab === "barcode" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                      }`}
                      aria-pressed={scanTab === "barcode"}
                    >
                      BARCODE
                    </button>
                  </div>
                  <div className="flex min-h-[14rem] w-full max-w-[16rem] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-3 py-4 text-center text-xs text-slate-500">
                    {!scanPayload ? (
                      <span>ยังไม่มีหมายเลขติดตามสำหรับสร้างรหัสสแกน</span>
                    ) : scanCodesLoading ? (
                      <span className="text-slate-400">กำลังสร้างรหัส…</span>
                    ) : scanCodesError ? (
                      <span className="text-rose-600">{scanCodesError}</span>
                    ) : scanTab === "qr" && scanQrUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- data URL from qrcode
                      <img src={scanQrUrl} alt="" className="h-[220px] w-[220px] max-w-full object-contain" />
                    ) : scanTab === "barcode" && scanBarcodeUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- data URL from jsbarcode
                      <img src={scanBarcodeUrl} alt="" className="max-h-32 w-full max-w-full object-contain" />
                    ) : (
                      <span>ไม่สามารถแสดงรหัสได้</span>
                    )}
                  </div>
                  {scanPayload ? (
                    <p className="mt-2 text-center font-mono text-[10px] text-slate-500 break-all">
                      สแกนแล้วได้: {scanPayload}
                    </p>
                  ) : null}
                  <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-400">
                    ใช้ QR CODE หรือ BARCODE นี้สำหรับให้เจ้าหน้าที่สแกนเพื่อพิมพ์ใบปะหน้า ที่ไปรษณีย์ไทยได้ทุกสาขา
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Parcel summary */}
          {!loading ? (
            <div className="rounded-2xl bg-white px-4 py-2 shadow-sm ring-1 ring-slate-200/80 print:shadow-none">
              <h2 className="border-b border-slate-100 py-3 text-base font-bold text-slate-900">สรุปข้อมูลพัสดุ</h2>
              <SummaryRow label="ผู้ส่ง">
                <div>
                  {shipperLine1 ? <span className="block">{shipperLine1}</span> : <span className="font-normal text-slate-400">-</span>}
                  {shipperLine2 ? <span className="mt-1 block text-xs font-normal text-slate-600">{shipperLine2}</span> : null}
                </div>
              </SummaryRow>
              <SummaryRow label="ผู้รับ">
                <div>
                  {recipientLine1 ? (
                    <span className="block">{recipientLine1}</span>
                  ) : parcel?.destination ? (
                    <span className="block">{parcel.destination}</span>
                  ) : (
                    <span className="font-normal text-slate-400">-</span>
                  )}
                  {recipientLine2 ? <span className="mt-1 block text-xs font-normal text-slate-600">{recipientLine2}</span> : null}
                </div>
              </SummaryRow>
              <SummaryRow label="น้ำหนัก">{formatWeightGrams(parcel, order)}</SummaryRow>
              <SummaryRow label="ขนาด">{sizeDisplay}</SummaryRow>
              <SummaryRow label="ประเภท">{typeDisplay}</SummaryRow>
              {referenceCode ? (
                <div className="flex flex-col gap-0.5 border-t border-slate-50 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
                  <p className="text-[11px] text-slate-400">Reference code</p>
                  <p className="break-all font-mono text-[11px] text-slate-400 sm:text-right">{referenceCode}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Label actions */}
          {!loading ? (
            <div className="space-y-3 print:hidden">
              <div className="flex items-center gap-3 my-8">
                <span className="h-px flex-1 bg-slate-300" />
                <span className="text-sm font-normal text-slate-500">ใบปะหน้า</span>
                <span className="h-px flex-1 bg-slate-300" />
              </div>
              <div className="flex justify-center gap-10">
              <button
                type="button"
                onClick={onDownloadLabelPdf}
                disabled={!labelPdfUrl}
                className="flex flex-col items-center gap-2 text-slate-700"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#E8E4FF] text-[#5B4FCF] shadow-sm">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-7 w-7" aria-hidden>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                </span>
                <span className="text-xs font-medium">ดาวน์โหลดใบปะหน้า</span>
              </button>
              <button
                type="button"
                onClick={onOpenLabelPrintTab}
                disabled={!labelPdfUrl}
                className="flex flex-col items-center gap-2 text-slate-700"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#E8E4FF] text-[#5B4FCF] shadow-sm">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-7 w-7" aria-hidden>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                    />
                  </svg>
                </span>
                <span className="text-xs font-medium">พิมพ์ใบปะหน้า</span>
              </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 bg-slate-100 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 shadow-[0_-6px_20px_rgba(15,23,42,0.08)] print:hidden">
        <div className="mx-auto flex w-full max-w-lg gap-3">
          <Link
            href="/parcels"
            className="flex-1 rounded-full border-2 border-[#2726F5] bg-white py-3 text-center text-sm font-semibold text-[#2726F5]"
          >
            พัสดุของฉัน
          </Link>
          <Link
            href="/send"
            className="flex-1 rounded-full bg-[#2726F5] py-3 text-center text-sm font-semibold text-white shadow-[0_6px_14px_rgba(39,38,245,0.35)]"
          >
            จัดส่งเพิ่มเติม
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
