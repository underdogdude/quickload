"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ParcelDetailResponse = {
  ok?: boolean;
  data?: {
    parcel?: {
      id: string;
      trackingId: string;
      destination: string | null;
      status: string;
      isPaid: boolean;
      weightKg: string | null;
      size: string | null;
      price: string | null;
      createdAt: string;
      updatedAt: string | null;
    };
    legacy?: unknown;
    events?: unknown[];
  };
  error?: string;
};

export default function ParcelDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [json, setJson] = useState<ParcelDetailResponse["data"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function getStatusLabel(status: string) {
    if (status === "draft") return "แบบร่าง";
    if (status === "registered") return "ลงทะเบียนแล้ว";
    if (status === "in_transit") return "อยู่ระหว่างขนส่ง";
    if (status === "delivered") return "จัดส่งสำเร็จ";
    if (status === "failed") return "จัดส่งไม่สำเร็จ";
    return status;
  }

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
          <h1 className="text-3xl font-bold leading-none">รายละเอียดพัสดุ</h1>
          <p className="mt-1 text-sm text-white/80">ตรวจสอบสถานะและข้อมูลคำสั่งซื้อ</p>
        </div>
      </section>

      <section className="-mt-8 px-6">
        <div className="mx-auto w-full max-w-lg space-y-3">
          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</div>
          ) : null}

          {loading ? (
            <div className="rounded-lg bg-white p-4 text-sm text-slate-500 shadow-sm">กำลังโหลดข้อมูล...</div>
          ) : null}

          {json?.parcel ? (
            <article className="rounded-lg bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-slate-500">Tracking ID</p>
                  <p className="text-sm font-semibold text-slate-900">{json.parcel.trackingId}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{getStatusLabel(json.parcel.status)}</span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                <p>ปลายทาง: {json.parcel.destination ?? "-"}</p>
                <p>การชำระเงิน: {json.parcel.isPaid ? "ชำระเงินแล้ว" : "รอชำระเงิน"}</p>
                <p>น้ำหนัก(กก.): {json.parcel.weightKg ?? "-"}</p>
                <p>ขนาด/ประเภท: {json.parcel.size ?? "-"}</p>
                <p>ราคา: {json.parcel.price ?? "-"}</p>
                <p>สร้างเมื่อ: {new Date(json.parcel.createdAt).toLocaleString("th-TH")}</p>
              </div>
            </article>
          ) : null}
        </div>
      </section>
    </main>
  );
}
