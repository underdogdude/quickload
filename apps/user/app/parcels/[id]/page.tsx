"use client";

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
  price: string | null;
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
  items: string | null;
} | null;

type TrackingEvent = {
  date?: string | null;
  datetime?: string | null;
  location?: string | null;
  status?: string | null;
  description?: string | null;
  [k: string]: unknown;
};

type ParcelDetailResponse = {
  ok?: boolean;
  data?: {
    parcel?: ParcelData;
    order?: OrderData;
    legacy?: unknown;
    events?: TrackingEvent[];
  };
  error?: string;
};

function getStatusLabel(status: string) {
  if (status === "draft") return "Draft";
  if (status === "registered") return "Registered";
  if (status === "in_transit") return "In Transit";
  if (status === "delivered") return "Delivered";
  if (status === "failed") return "Delivery Failed";
  return status;
}

function getStatusBadgeClass(status: string) {
  if (status === "draft") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "registered") return "border-indigo-200 bg-indigo-50 text-indigo-700";
  if (status === "in_transit") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "delivered") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "failed") return "border-rose-200 bg-rose-50 text-rose-700";
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2.5 last:border-b-0">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-right text-sm font-medium text-slate-800">{value || "-"}</p>
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
  const events = useMemo(() => (Array.isArray(json?.events) ? json?.events : []), [json?.events]);
  const trackingNo = order?.barcode?.trim() || parcel?.barcode?.trim() || parcel?.trackingId || "-";
  const senderAddress = compactAddress([
    order?.shipperAddress,
    order?.shipperSubdistrict,
    order?.shipperDistrict,
    order?.shipperProvince,
    order?.shipperZipcode,
  ]);
  const recipientAddress = compactAddress([order?.cusAdd, order?.cusSub, order?.cusAmp, order?.cusProv, order?.cusZipcode]);

  return (
    <main className="min-h-screen bg-slate-100 pb-28">
      <section className="bg-[#2726F5] px-6 pb-14 pt-10 text-white">
        <div className="mx-auto w-full max-w-lg">
          <button
            type="button"
            onClick={() => router.back()}
            className="mb-3 inline-flex items-center gap-1 rounded-full border border-white/40 px-3 py-1.5 text-xs font-medium text-white/95"
          >
            <span aria-hidden>←</span>
            <span>Back</span>
          </button>
          <h1 className="text-3xl font-bold leading-none">Parcel Detail</h1>
          <p className="mt-1 text-sm text-white/80">Shipment profile, consignee details, and tracking timeline</p>
        </div>
      </section>

      <section className="-mt-8 px-6">
        <div className="mx-auto w-full max-w-lg space-y-3">
          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</div>
          ) : null}

          {loading ? <div className="rounded-lg bg-white p-4 text-sm text-slate-500 shadow-sm">Loading shipment profile...</div> : null}

          {parcel ? (
            <>
              <article className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-slate-500">Tracking Number</p>
                    <p className="text-xl font-semibold tracking-tight text-slate-900">{trackingNo}</p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusBadgeClass(parcel.status)}`}>
                    {getStatusLabel(parcel.status)}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Link
                    href={`/api/parcels/${parcel.id}/label.pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                  >
                    Print Label
                  </Link>
                  <Link
                    href="/tracking"
                    className="inline-flex items-center justify-center rounded-lg bg-[#2726F5] px-3 py-2 text-xs font-semibold text-white"
                  >
                    Open Tracking
                  </Link>
                </div>
              </article>

              <article className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <h2 className="text-sm font-semibold text-slate-900">Shipment Info</h2>
                <div className="mt-2">
                  <InfoRow label="Parcel ID" value={parcel.id} />
                  <InfoRow label="Reference" value={order?.smartpostTrackingcode || "-"} />
                  <InfoRow label="Destination" value={parcel.destination || "-"} />
                  <InfoRow label="Payment" value={parcel.isPaid ? "Paid" : "Pending"} />
                  <InfoRow label="Weight" value={order?.productWeight ? `${order.productWeight} g` : parcel.weightKg ? `${parcel.weightKg} kg` : "-"} />
                  <InfoRow label="Package Type" value={parcel.parcelType || order?.productInbox || order?.items || "-"} />
                  <InfoRow label="Size" value={parcel.size || "-"} />
                  <InfoRow label="Price" value={parcel.price || "-"} />
                  <InfoRow label="Created" value={formatDateTime(parcel.createdAt)} />
                  <InfoRow label="Updated" value={formatDateTime(parcel.updatedAt)} />
                </div>
              </article>

              <article className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <h2 className="text-sm font-semibold text-slate-900">Parties</h2>
                <div className="mt-3 space-y-3">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Shipper</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{order?.shipperName || "-"}</p>
                    <p className="text-sm text-slate-700">{order?.shipperMobile || "-"}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">{senderAddress || "-"}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Consignee</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{order?.cusName || "-"}</p>
                    <p className="text-sm text-slate-700">{order?.cusTel || "-"}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">{recipientAddress || "-"}</p>
                  </div>
                </div>
              </article>

              <article className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <h2 className="text-sm font-semibold text-slate-900">Tracking Events</h2>
                {events.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">No tracking events yet</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {events.slice(0, 12).map((event, idx) => (
                      <div key={`${event.datetime ?? event.date ?? "event"}-${idx}`} className="rounded-lg border border-slate-100 p-3">
                        <p className="text-xs font-medium text-slate-500">
                          {event.datetime || event.date ? formatDateTime(String(event.datetime || event.date)) : "-"}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{event.status || event.description || "Status update"}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{event.location || "-"}</p>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}
