"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ParcelRow = {
  id: string;
  trackingId: string;
  status: string;
  destination: string | null;
  isPaid: boolean;
  createdAt: string;
};

export default function ParcelsPage() {
  const [items, setItems] = useState<ParcelRow[]>([]);
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

  function getStatusClass(status: string) {
    if (status === "draft") return "bg-amber-100 text-amber-800";
    if (status === "registered") return "bg-blue-100 text-blue-800";
    if (status === "in_transit") return "bg-sky-100 text-sky-800";
    if (status === "delivered") return "bg-emerald-100 text-emerald-800";
    if (status === "failed") return "bg-rose-100 text-rose-800";
    return "bg-slate-100 text-slate-700";
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/parcels");
        const json = (await res.json()) as { ok?: boolean; data?: ParcelRow[]; error?: string };
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setError(json.error ?? "โหลดรายการพัสดุไม่สำเร็จ");
          return;
        }
        const sorted = [...(json.data ?? [])].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
        setItems(sorted);
      } catch {
        if (!cancelled) setError("โหลดรายการพัสดุไม่สำเร็จ");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-100 pb-28">
      <section className="bg-[#2726F5] px-6 pb-14 pt-10 text-white">
        <div className="mx-auto w-full max-w-lg">
          <h1 className="text-3xl font-bold leading-none">พัสดุของฉัน</h1>
          <p className="mt-1 text-sm text-white/80">ติดตามสถานะและจัดการคำสั่งซื้อของคุณ</p>
        </div>
      </section>

      <section className="-mt-8 px-6">
        <div className="mx-auto w-full max-w-lg space-y-3">
          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{error}</div>
          ) : null}

          {loading ? <p className="rounded-lg bg-white p-4 text-sm text-slate-500 shadow-sm">กำลังโหลดรายการ...</p> : null}

          {items.map((p) => (
            <article key={p.id} className="rounded-lg bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{p.trackingId}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{p.destination ?? "ยังไม่ได้ระบุปลายทาง"}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${getStatusClass(p.status)}`}>
                  {getStatusLabel(p.status)}
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <p className="text-xs text-slate-500">{p.isPaid ? "ชำระเงินแล้ว" : "รอชำระเงิน"}</p>
                <div className="flex items-center gap-2">
                  {p.status === "draft" && !p.isPaid ? (
                    <Link href="/payment" className="rounded-full bg-[#2726F5] px-3 py-1.5 text-xs font-medium text-white">
                      ชำระเงิน
                    </Link>
                  ) : null}
                  <Link href={`/parcels/${p.id}`} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700">
                    ดูรายละเอียด
                  </Link>
                </div>
              </div>
            </article>
          ))}

          {!loading && items.length === 0 && !error ? (
            <div className="rounded-lg bg-white p-5 text-center shadow-sm">
              <p className="text-sm font-medium text-slate-700">ยังไม่มีพัสดุ</p>
              <p className="mt-1 text-xs text-slate-500">เริ่มสร้างรายการส่งพัสดุใหม่ได้ที่หน้าส่งพัสดุ</p>
              <Link href="/send" className="mt-3 inline-flex rounded-full bg-[#2726F5] px-4 py-2 text-xs font-medium text-white">
                ไปหน้าส่งพัสดุ
              </Link>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

