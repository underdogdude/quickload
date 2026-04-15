"use client";

import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type TrackingApiResponse = {
  ok?: boolean;
  data?: {
    parcel?: {
      id: string;
      trackingId: string;
      destination: string | null;
      status: string;
      isPaid: boolean;
      createdAt: string;
    };
    legacy?: unknown;
    events?: unknown[];
  };
  error?: string;
};

export default function TrackingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const trackingIdParam = searchParams.get("trackingId")?.trim() ?? "";
  const [trackingId, setTrackingId] = useState(trackingIdParam);
  const [data, setData] = useState<TrackingApiResponse["data"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function getStatusLabel(status?: string) {
    if (status === "draft") return "แบบร่าง";
    if (status === "registered") return "ลงทะเบียนแล้ว";
    if (status === "in_transit") return "อยู่ระหว่างขนส่ง";
    if (status === "delivered") return "จัดส่งสำเร็จ";
    if (status === "failed") return "จัดส่งไม่สำเร็จ";
    return status ?? "-";
  }

  function getStatusClass(status?: string) {
    if (status === "draft") return "bg-amber-100 text-amber-800";
    if (status === "registered") return "bg-blue-100 text-blue-800";
    if (status === "in_transit") return "bg-sky-100 text-sky-800";
    if (status === "delivered") return "bg-emerald-100 text-emerald-800";
    if (status === "failed") return "bg-rose-100 text-rose-800";
    return "bg-slate-100 text-slate-700";
  }

  async function searchByTrackingId(rawTrackingId: string) {
    const nextTrackingId = rawTrackingId.trim();
    if (!nextTrackingId) {
      setError("กรุณาระบุ Tracking ID");
      setData(null);
      return;
    }
    setError(null);
    setData(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/parcels/by-tracking/${encodeURIComponent(nextTrackingId)}`);
      const body = (await res.json()) as TrackingApiResponse;
      if (!res.ok) {
        setError(body.error ?? "ไม่พบข้อมูลพัสดุ");
        return;
      }
      setData(body.data ?? null);
    } finally {
      setLoading(false);
    }
  }

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    await searchByTrackingId(trackingId);
  }

  useEffect(() => {
    if (!trackingIdParam) return;
    setTrackingId(trackingIdParam);
    void searchByTrackingId(trackingIdParam);
  }, [trackingIdParam]);

  const hasResult = Boolean(data);
  const showEmptyMessage = !loading && !hasResult && !error;
  const parcel = data?.parcel;
  const eventCount = Array.isArray(data?.events) ? data.events.length : 0;

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
            <span>กลับ</span>
          </button>
          <h1 className="text-3xl font-bold leading-none">ติดตามพัสดุ</h1>
          <p className="mt-1 text-sm text-white/80">ค้นหาสถานะจาก Tracking ID</p>
        </div>
      </section>

      <section className="-mt-8 px-6">
        <div className="mx-auto w-full max-w-lg space-y-3">
          <form onSubmit={onSearch} className="rounded-lg bg-white p-4 shadow-sm">
            <label htmlFor="tracking-id-input" className="text-xs font-medium text-slate-500">
              Tracking ID
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="tracking-id-input"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#2726F5]"
                placeholder="เช่น QLDRAFT-123456..."
                value={trackingId}
                onChange={(e) => setTrackingId(e.target.value)}
                required
              />
              <button
                className="rounded-lg bg-[#2726F5] px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                type="submit"
                disabled={loading}
              >
                {loading ? "กำลังค้นหา..." : "ค้นหา"}
              </button>
            </div>
          </form>

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</div>
          ) : null}

          {showEmptyMessage ? (
            <div className="rounded-lg bg-white p-4 text-sm text-slate-600 shadow-sm">กรอก Tracking ID เพื่อค้นหา</div>
          ) : null}

          {parcel ? (
            <article className="rounded-lg bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-slate-500">Tracking ID</p>
                  <p className="text-sm font-semibold text-slate-900">{parcel.trackingId}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${getStatusClass(parcel.status)}`}>
                  {getStatusLabel(parcel.status)}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                <p>ปลายทาง: {parcel.destination ?? "-"}</p>
                <p>การชำระเงิน: {parcel.isPaid ? "ชำระเงินแล้ว" : "รอชำระเงิน"}</p>
                <p>จำนวนเหตุการณ์ติดตาม: {eventCount}</p>
                <p>สร้างเมื่อ: {new Date(parcel.createdAt).toLocaleString("th-TH")}</p>
              </div>
            </article>
          ) : null}
        </div>
      </section>
    </main>
  );
}
