"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function PaymentPage() {
  const [balance, setBalance] = useState<number | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"outstanding" | "history">("outstanding");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/payment");
      const json = (await res.json()) as { ok?: boolean; data?: { balance: number | null }; error?: string };
      if (cancelled) return;
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Failed");
        return;
      }
      setBalance(json.data?.balance ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const formattedBalance =
    balance == null
      ? "-"
      : new Intl.NumberFormat("th-TH", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(balance);

  return (
    <main className="min-h-screen bg-slate-100 pb-28">
      <section className="bg-[#2726F5] px-6 pb-14 pt-10 text-white">
        <div className="mx-auto w-full max-w-lg">
          <h1 className="text-3xl font-bold leading-none">ชำระเงิน</h1>
          <p className="mt-1 text-sm text-white/80">ตรวจสอบยอดคงค้างและสถานะการชำระเงิน</p>
        </div>
      </section>

      <section className="-mt-8 px-6">
        <div className="mx-auto w-full max-w-lg space-y-3">
          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
              {error}
            </div>
          ) : null}

          <div className="rounded-full bg-white p-1.5 shadow-sm ring-1 ring-slate-200">
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => setTab("outstanding")}
                className={`rounded-full px-3 py-2.5 text-md font-medium transition ${
                  tab === "outstanding" ? "bg-[#2726F5] text-white" : "text-slate-500"
                }`}
              >
                ค้างชำระ
              </button>
              <button
                type="button"
                onClick={() => setTab("history")}
                className={`rounded-full px-3 py-2.5 text-md font-medium transition ${
                  tab === "history" ? "bg-[#2726F5] text-white" : "text-slate-500"
                }`}
              >
                ประวัติการชำระ
              </button>
            </div>
          </div>

          {tab === "outstanding" ? (
            <article className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <p className="text-sm font-medium text-slate-500">ยอดคงเหลือที่ต้องชำระ</p>
              {balance === undefined && !error ? (
                <div className="mt-3 space-y-2">
                  <div className="h-9 w-44 animate-pulse rounded-lg bg-slate-100" />
                  <div className="h-4 w-32 animate-pulse rounded-lg bg-slate-100" />
                </div>
              ) : (
                <>
                  <p className="mt-3 text-4xl font-semibold leading-none text-[#2726F5]">{formattedBalance}</p>
                  <p className="mt-1 text-sm text-slate-500">บาท</p>
                </>
              )}
            </article>
          ) : (
            <article className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <p className="text-sm font-medium text-slate-500">ประวัติการชำระ</p>
              <p className="mt-3 text-sm text-slate-600">ยังไม่มีประวัติการชำระ</p>
            </article>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/parcels"
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700"
            >
              ดูรายการพัสดุ
            </Link>
            <Link
              href="/send"
              className="inline-flex items-center justify-center rounded-lg bg-[#2726F5] px-4 py-2.5 text-sm font-medium text-white"
            >
              สร้างรายการใหม่
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
