"use client";

import { resolveParcelDisplayStatus } from "@quickload/shared/parcel-display-status";
import {
  effectiveLogisticsStatus,
  ListParcelThaiPostProgressHorizontal,
} from "@/lib/parcel-shipment-progress";
import { computeParcelPriceBreakdown } from "@quickload/shared/parcel-price-breakdown";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type ParcelData = {
  id: string;
  trackingId: string;
  barcode: string | null;
  destination: string | null;
  parcelType: string | null;
  status: string;
  isPaid: boolean;
  weightKg: string | null;
  size: string | null;
  note: string | null;
  price: string | null;
  amountPaid?: string | null;
  thaiPostPriceConfirmedAt?: string | null;
  createdAt: string;
  updatedAt: string | null;
};

type OrderData = {
  barcode: string | null;
  smartpostTrackingcode: string | null;
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
  productWeight: string | null;
  productInbox: string | null;
  productPrice: string | null;
  insuranceRatePrice: string | null;
  items: string | null;
} | null;

type ParcelDetailResponse = {
  ok?: boolean;
  data?: {
    parcel?: ParcelData;
    order?: OrderData;
    legacy?: unknown;
    events?: unknown[];
    thaiPostEvents?: Array<{
      id: string;
      statusCode: string;
      description: string | null;
      statusDateRaw: string | null;
      station: string | null;
      barcode?: string | null;
      createdAt: string;
    }>;
  };
  error?: string;
};

function getStatusLabel(status: string) {
  if (status === "draft") return "แบบร่าง";
  if (status === "awaiting_actual_weight") return "รอลงทะเบียน/น้ำหนักจริง";
  if (status === "pending_payment") return "รอชำระเงิน";
  if (status === "registered") return "ลงทะเบียนแล้ว";
  if (status === "at_destination_post") return "ถึงปลายทาง/รอรับที่ไปรษณีย์";
  if (status === "in_transit") return "อยู่ระหว่างขนส่ง";
  if (status === "delivered") return "จัดส่งสำเร็จ";
  if (status === "returning") return "อยู่ระหว่างส่งคืน";
  if (status === "failed") return "จัดส่งไม่สำเร็จ";
  if (status === "canceled") return "ยกเลิกแล้ว";
  return status;
}

function resolveDisplayStatus(
  parcel: ParcelData,
  thaiPostEvents?: Array<{ statusCode: string; statusDateRaw?: string | null; createdAt: string }>,
): string {
  return resolveParcelDisplayStatus({ ...parcel, thaiPostEvents });
}

function getStatusBadgeClass(status: string) {
  if (status === "draft") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "awaiting_actual_weight") return "border-slate-300 bg-slate-100 text-slate-700";
  if (status === "pending_payment") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "paid") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "registered") return "border-indigo-200 bg-indigo-50 text-indigo-700";
  if (status === "at_destination_post") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "in_transit") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "delivered") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "returning") return "border-orange-200 bg-orange-50 text-orange-700";
  if (status === "failed") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "canceled") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

function compactAddress(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
}

function toNumberOrZero(value: string | null | undefined): number {
  if (!value) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatBaht(value: number) {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.max(0, value));
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2.5 last:border-b-0">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="max-w-[65%] text-right text-sm font-medium text-slate-800">{value || "-"}</p>
    </div>
  );
}

function PriceRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <p className="text-slate-600">{label}</p>
      <p className={`font-medium ${muted ? "text-slate-500" : "text-slate-800"}`}>{value}</p>
    </div>
  );
}

export default function ParcelDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [json, setJson] = useState<ParcelDetailResponse["data"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [estimatedBasePrice, setEstimatedBasePrice] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/parcels/${id}`);
        const body = (await res.json()) as ParcelDetailResponse;
        if (cancelled) return;
        if (!res.ok || !body.ok) {
          setError(body.error ?? "โหลดข้อมูลไม่สำเร็จ");
          return;
        }
        setJson(body.data ?? null);
      } catch {
        if (!cancelled) setError("โหลดข้อมูลไม่สำเร็จ");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const parcel = json?.parcel;
  const order = json?.order;

  useEffect(() => {
    if (!parcel || !order?.cusZipcode) return;
    if (parcel.thaiPostPriceConfirmedAt) {
      setEstimatedBasePrice(null);
      return;
    }

    const weightGram = Number(order.productWeight ?? 0);
    if (!Number.isFinite(weightGram) || weightGram <= 0) return;

    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({
          productWeight: String(weightGram),
          cusZipcode: order.cusZipcode!.trim(),
          productPrice: order.productPrice?.trim() || "0",
          insurancePrice: order.insuranceRatePrice?.trim() || "0",
        });
        const res = await fetch(`/api/pricing/estimate?${params.toString()}`);
        const body = (await res.json()) as { ok?: boolean; data?: { estimatedTotal?: number } };
        if (cancelled || !res.ok || !body.ok || !Number.isFinite(body.data?.estimatedTotal)) return;
        setEstimatedBasePrice(Number(body.data?.estimatedTotal));
      } catch {
        // Keep breakdown without estimate when pricing API is unavailable.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [order?.cusZipcode, order?.insuranceRatePrice, order?.productPrice, order?.productWeight, parcel]);

  const priceBreakdown = useMemo(() => {
    if (!parcel) return null;
    return computeParcelPriceBreakdown({
      parcelPrice: parcel.price,
      thaiPostPriceConfirmedAt: parcel.thaiPostPriceConfirmedAt,
      status: parcel.status,
      cusZipcode: order?.cusZipcode,
      productPrice: order?.productPrice,
      insuranceRatePrice: order?.insuranceRatePrice,
      estimatedBasePrice,
    });
  }, [estimatedBasePrice, order?.cusZipcode, order?.insuranceRatePrice, order?.productPrice, parcel]);
  const thaiPostEventsChronological = useMemo(() => {
    const arr = Array.isArray(json?.thaiPostEvents) ? [...json.thaiPostEvents] : [];
    return arr.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [json?.thaiPostEvents]);
  const trackingNo = order?.barcode?.trim() || parcel?.barcode?.trim() || parcel?.trackingId || "-";
  const senderAddress = compactAddress([
    order?.shipperAddress,
    order?.shipperSubdistrict,
    order?.shipperDistrict,
    order?.shipperProvince,
    order?.shipperZipcode,
  ]);
  const recipientAddress = compactAddress([order?.cusAdd, order?.cusSub, order?.cusAmp, order?.cusProv, order?.cusZipcode]);

  const displayStatus = parcel ? resolveDisplayStatus(parcel, thaiPostEventsChronological) : null;
  const paymentHint =
    parcel == null
      ? null
      : displayStatus === "awaiting_actual_weight"
        ? "นำพัสดุไปชั่งน้ำหนักที่จุดบริการ"
        : parcel.status === "pending_payment" && !parcel.isPaid && parcel.thaiPostPriceConfirmedAt
          ? `ชำระเงิน ${formatBaht(toNumberOrZero(parcel.price) - toNumberOrZero(parcel.amountPaid))} บาท`
          : parcel.isPaid
            ? "ชำระเงินสำเร็จแล้ว"
            : null;

  return (
    <main className="min-h-screen bg-slate-100 pb-28">
      <section className="bg-[#2726F5] px-6 pb-14 pt-10 text-white">
        <div className="mx-auto w-full max-w-lg">
          <button
            type="button"
            onClick={() => router.push("/parcels")}
            className="mb-3 inline-flex items-center gap-1 rounded-full border border-white/40 px-3 py-1.5 text-xs font-medium text-white/95"
          >
            <span aria-hidden>←</span>
            <span>กลับ</span>
          </button>
          <h1 className="text-3xl font-bold leading-none">รายละเอียดพัสดุ</h1>
          <p className="mt-1 text-sm text-white/80">ข้อมูลพัสดุ ผู้ส่ง-ผู้รับ และไทม์ไลน์สถานะล่าสุด</p>
        </div>
      </section>

      <section className="-mt-8 px-6">
        <div className="mx-auto w-full max-w-lg space-y-3">
          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</div>
          ) : null}

          {loading ? <div className="rounded-lg bg-white p-4 text-sm text-slate-500 shadow-sm">กำลังโหลดรายละเอียดพัสดุ...</div> : null}

          {parcel ? (
            <>
              <article className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400">หมายเลขพัสดุ</p>
                    <p className="truncate text-2xl font-medium tracking-tight text-slate-900">{trackingNo}</p>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusBadgeClass(
                      displayStatus ?? parcel.status,
                    )}`}
                  >
                    {getStatusLabel(displayStatus ?? parcel.status)}
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {parcel.status === "pending_payment" && !parcel.isPaid && parcel.thaiPostPriceConfirmedAt ? (
                    <Link
                      href={`/pay/${parcel.id}`}
                      className="inline-flex w-full shrink-0 items-center gap-1 rounded-md bg-[#2726F5] px-4 py-4 text-sm font-medium text-white shadow-sm transition justify-center hover:bg-indigo-700"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" aria-hidden>
                        <path d="M3 7h18v10H3V7Zm0 4h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                      ชำระเงิน {formatBaht(toNumberOrZero(parcel.price) - toNumberOrZero(parcel.amountPaid))} บาท
                    </Link>
                  ) : null}
                  <Link
                    href={`/api/parcels/${parcel.id}/label.pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-printer" viewBox="0 0 16 16">
                      <path d="M2.5 8a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1"/>
                      <path d="M5 1a2 2 0 0 0-2 2v2H2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1v1a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1h1a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1V3a2 2 0 0 0-2-2zM4 3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2H4zm1 5a2 2 0 0 0-2 2v1H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v-1a2 2 0 0 0-2-2zm7 2v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1"/>
                    </svg>
                    พิมพ์ใบปะหน้า
                  </Link>
                </div>
              </article>

              <article className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <h2 className="text-sm font-semibold text-slate-900">ความคืบหน้าการจัดส่ง</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">รวมภาพรวมการขนส่งและประวัติสถานะจากไปรษณีย์ไทยในบล็อกเดียว</p>
                <ListParcelThaiPostProgressHorizontal
                  parcel={{
                    status: effectiveLogisticsStatus({
                      ...parcel,
                      thaiPostEvents: thaiPostEventsChronological,
                    }),
                    isPaid: parcel.isPaid,
                    thaiPostEvents: thaiPostEventsChronological,
                  }}
                />
              </article>

              <article className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <h2 className="text-sm font-semibold text-slate-900">ข้อมูลผู้ส่ง-ผู้รับ</h2>
                <div className="mt-3 space-y-3">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">ผู้ส่ง</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{order?.shipperName || "-"}</p>
                    <p className="text-sm text-slate-700">{order?.shipperMobile || "-"}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">{senderAddress || "-"}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">ผู้รับ</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{order?.cusName || "-"}</p>
                    <p className="text-sm text-slate-700">{order?.cusTel || "-"}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">{recipientAddress || "-"}</p>
                  </div>
                </div>
              </article>

              <article className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <h2 className="text-sm font-semibold text-slate-900">ข้อมูลพัสดุ</h2>
                <div className="mt-2">
                  <InfoRow label="PARCEL ID" value={parcel.id} />
                  <InfoRow label="REFERENCE" value={order?.smartpostTrackingcode || "-"} />
                  <InfoRow label="ปลายทาง" value={parcel.destination || "-"} />
                  <InfoRow label="การชำระเงิน" value={parcel.isPaid ? "ชำระแล้ว" : "ยังไม่ชำระ"} />
                  <InfoRow label="น้ำหนัก" value={order?.productWeight ? `${order.productWeight} g` : parcel.weightKg ? `${parcel.weightKg} kg` : "-"} />
                  <InfoRow label="ประเภทพัสดุ" value={parcel.parcelType || order?.productInbox || order?.items || "-"} />
                  <InfoRow label="ขนาด" value={parcel.size || "-"} />
                  <InfoRow label="หมายเหตุ" value={parcel.note?.trim() || "—"} />
                  <InfoRow label="สร้างเมื่อ" value={formatDateTime(parcel.createdAt)} />
                  <InfoRow label="อัปเดตล่าสุด" value={formatDateTime(parcel.updatedAt)} />
                </div>
              </article>

              <article className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">ราคา</h2>
                    <p className="mt-0.5 text-xs text-slate-500">รายละเอียดค่าขนส่ง ประกัน และพื้นที่ห่างไกล</p>
                  </div>
                  {priceBreakdown?.showPendingBadge ? (
                    <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800">
                      รอน้ำหนัก/ราคาจริง
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 space-y-2">
                  <PriceRow
                    label={priceBreakdown?.shippingIsEstimate ? "ราคาขนส่ง (ประมาณ)" : "ราคาขนส่ง"}
                    value={
                      priceBreakdown?.shippingFee != null
                        ? `${formatBaht(priceBreakdown.shippingFee)} บาท`
                        : "รอการยืนยัน"
                    }
                    muted={priceBreakdown?.shippingFee == null}
                  />
                  <PriceRow
                    label="ค่าประกันเพิ่ม"
                    value={`${formatBaht(priceBreakdown?.insuranceFee ?? 0)} บาท`}
                    muted={(priceBreakdown?.insuranceFee ?? 0) === 0}
                  />
                  <PriceRow
                    label="ค่าบริการพื้นที่ห่างไกล"
                    value={`${formatBaht(priceBreakdown?.remoteAreaFee ?? 0)} บาท`}
                    muted={(priceBreakdown?.remoteAreaFee ?? 0) === 0}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                  <p className="text-sm text-slate-600">
                    {priceBreakdown?.isPriceConfirmed ? "ราคารวม" : "ราคารวมโดยประมาณ"}
                  </p>
                  <p className="text-lg font-semibold text-slate-900">
                    {priceBreakdown?.total != null ? `${formatBaht(priceBreakdown.total)} บาท` : "—"}
                  </p>
                </div>
                {priceBreakdown?.showPendingBadge ? (
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                    *ราคาจริงจะแสดงเมื่อชั่งน้ำหนักที่สาขาไปรษณีย์และได้รับการยืนยันจากไปรษณีย์ไทย
                  </p>
                ) : null}
                {priceBreakdown?.isPriceConfirmed && parcel.thaiPostPriceConfirmedAt ? (
                  <p className="mt-2 text-xs text-slate-500">
                    ยืนยันราคาเมื่อ {formatDateTime(parcel.thaiPostPriceConfirmedAt)}
                  </p>
                ) : null}
              </article>
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}
