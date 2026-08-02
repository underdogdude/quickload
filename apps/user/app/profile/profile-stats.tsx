"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type ProfileStats = {
  parcelsTotal: number;
  pickupRequests: number;
  paymentsSucceeded: number;
  paymentsPending: number;
};

type StatsResponse = {
  ok?: boolean;
  data?: ProfileStats;
  error?: string;
};

const STAT_ITEMS = [
  { key: "parcelsTotal", label: "พัสดุทั้งหมด", href: "/parcels" },
  { key: "pickupRequests", label: "รถเข้ารับพัสดุ", href: "/pickup/requests" },
  {
    key: "paymentsSucceeded",
    label: "ชำระเงินสำเร็จ",
    href: "/payment?tab=history",
  },
  { key: "paymentsPending", label: "รอชำระเงิน", href: "/payment" },
] as const;

export function ProfileStatsPanel() {
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadStats = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch("/api/profile/stats", {
        credentials: "include",
        cache: "no-store",
        signal,
      });
      const json = (await response.json()) as StatsResponse;
      if (!response.ok || !json.ok || !json.data) {
        throw new Error(json.error || "โหลดสถิติไม่สำเร็จ");
      }
      setStats(json.data);
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      setStats(null);
      setError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadStats(controller.signal);
    return () => controller.abort();
  }, [loadStats]);

  return (
    <div>
      <div
        className="grid grid-cols-4 overflow-hidden rounded-2xl bg-[linear-gradient(to_top,_#dcedff_0%,_white_100%)] shadow-[0_6px_8px_rgba(15,23,42,0.08)]"
        aria-label="สถิติการใช้งาน"
      >
        {STAT_ITEMS.map((item, index) => {
          const value = stats?.[item.key];
          return (
            <Link
              key={item.key}
              href={item.href}
              prefetch
              className={`relative flex min-h-[88px] flex-col items-center justify-center px-1.5 py-3 text-center focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0802b8] ${
                index > 0 ? "before:absolute before:inset-y-4 before:left-0 before:w-px before:bg-slate-200" : ""
              }`}
              aria-label={`${item.label} ${loading ? "กำลังโหลด" : error ? "โหลดไม่สำเร็จ" : `${value ?? 0} รายการ`}`}
            >
              {loading ? (
                <span
                  className="mb-2 h-6 w-8 animate-pulse rounded bg-slate-200 motion-reduce:animate-none"
                  aria-hidden
                />
              ) : (
                <span className="text-2xl font-medium leading-none text-[#0802b8]">
                  {error ? "—" : value ?? 0}
                </span>
              )}
              <span className="mt-2 text-[11px] leading-[1.25] text-slate-600 sm:text-xs">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>

      {error ? (
        <div className="mt-2 flex items-center justify-center gap-2 text-xs text-slate-600" role="status">
          <span>ไม่สามารถโหลดสถิติได้</span>
          <button
            type="button"
            onClick={() => void loadStats()}
            className="min-h-11 rounded-full px-3 font-medium text-[#0802b8] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0802b8]"
          >
            ลองอีกครั้ง
          </button>
        </div>
      ) : null}
    </div>
  );
}
