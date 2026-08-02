"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { readApiJson } from "@/lib/api-json";
import type { PickupRequestDto } from "@/lib/iship-pickup";
import { PickupHistoryItem, PickupLoadingRows } from "../pickup-history";

type RequestScope = "active" | "all";

export function PickupRequestsClient() {
  const [scope, setScope] = useState<RequestScope>("active");
  const [items, setItems] = useState<PickupRequestDto[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRequests = useCallback(
    async (nextPage = 1, append = false) => {
      append ? setLoadingMore(true) : setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: String(nextPage),
          ...(scope === "active" ? { scope: "active" } : {}),
        });
        const response = await fetch(`/api/pickup?${params.toString()}`, {
          cache: "no-store",
        });
        const json = await readApiJson<{
          ok?: boolean;
          data?: {
            items?: PickupRequestDto[];
            page?: number;
            hasMore?: boolean;
          };
          error?: string;
        }>(response, "โหลดรายการเข้ารับไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
        if (!response.ok || !json.ok) {
          throw new Error(json.error || "โหลดรายการเข้ารับไม่สำเร็จ");
        }
        const nextItems = json.data?.items ?? [];
        setItems((current) => (append ? [...current, ...nextItems] : nextItems));
        setPage(json.data?.page ?? nextPage);
        setHasMore(Boolean(json.data?.hasMore));
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "โหลดรายการเข้ารับไม่สำเร็จ",
        );
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [scope],
  );

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  return (
    <main className="pickup-surface min-h-screen bg-slate-100 pb-24">
      <section className="bg-[#0802b8] px-6 pb-12 pt-8 text-white">
        <div className="mx-auto w-full max-w-lg">
          <Link
            href="/pickup"
            className="mb-3 inline-flex items-center gap-1 rounded-full border border-white/40 px-3 py-1.5 text-xs font-medium text-white/95 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#0802b8]"
            aria-label="กลับไปหน้าเรียกรถเข้ารับ"
          >
            <span aria-hidden>←</span>
            <span>กลับ</span>
          </Link>
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold leading-tight text-balance">
                รายการเข้ารับ
              </h1>
              <p className="mt-1 text-base leading-6 text-white/90">
                ติดตามและจัดการคำขอของคุณ
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadRequests()}
              disabled={loading}
              aria-label={loading ? "กำลังโหลดรายการเข้ารับ" : "โหลดรายการเข้ารับอีกครั้ง"}
              title="โหลดรายการเข้ารับอีกครั้ง"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/40 bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className={`h-5 w-5 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`}
                aria-hidden="true"
              >
                <path
                  d="M20 11a8 8 0 0 0-14.9-4M4 4v4h4M4 13a8 8 0 0 0 14.9 4M20 20v-4h-4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </section>

      <div className="-mt-7 px-6">
        <div className="mx-auto w-full max-w-lg">
          <div
            className="rounded-lg bg-white p-1.5 shadow-sm"
            role="tablist"
            aria-label="เลือกประเภทรายการเข้ารับ"
          >
            <div className="grid grid-cols-2 gap-1">
              {([
                ["active", "กำลังดำเนินการ"],
                ["all", "รายการทั้งหมด"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={scope === value}
                  onClick={() => setScope(value)}
                  className={`min-h-11 rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0802b8] ${
                    scope === value
                      ? "bg-[#0802b8] text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <section
            className="mt-4 space-y-3"
            aria-label={scope === "active" ? "คำขอที่กำลังดำเนินการ" : "รายการเข้ารับทั้งหมด"}
          >
            {loading ? (
              <PickupLoadingRows />
            ) : error ? (
              <div className="rounded-lg bg-rose-50 p-4" role="alert">
                <p className="text-sm text-rose-800">{error}</p>
                <button
                  type="button"
                  onClick={() => void loadRequests()}
                  className="mt-3 min-h-11 rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white"
                >
                  ลองโหลดอีกครั้ง
                </button>
              </div>
            ) : items.length ? (
              <>
                {items.map((item) => (
                  <PickupHistoryItem
                    key={item.id}
                    item={item}
                    onCancelled={(updated) => {
                      if (scope === "active" && updated.status === "cancelled") {
                        setItems((current) =>
                          current.filter((row) => row.id !== updated.id),
                        );
                        return;
                      }
                      setItems((current) =>
                        current.map((row) => (row.id === updated.id ? updated : row)),
                      );
                    }}
                  />
                ))}
                {hasMore ? (
                  <button
                    type="button"
                    onClick={() => void loadRequests(page + 1, true)}
                    disabled={loadingMore}
                    className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0802b8] disabled:opacity-60"
                  >
                    {loadingMore ? "กำลังโหลด…" : "ดูรายการก่อนหน้า"}
                  </button>
                ) : null}
              </>
            ) : (
              <div className="rounded-lg bg-white px-3 py-10 text-center shadow-sm">
                <span
                  className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500"
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
                    <path
                      d="M8 5h8M8 9h8M8 13h5M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <p className="mt-3 font-medium text-slate-900">
                  {scope === "active"
                    ? "ไม่มีการเข้ารับที่กำลังดำเนินการ"
                    : "ยังไม่มีรายการเข้ารับ"}
                </p>
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  {scope === "active"
                    ? "คำขอใหม่จะแสดงที่นี่จนกว่าพนักงานจะเข้ารับสำเร็จ"
                    : "เมื่อเรียกรถแล้ว รายการและสถานะจะแสดงที่นี่"}
                </p>
                {scope === "active" ? (
                  <Link
                    href="/pickup"
                    className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-[#0802b8] px-4 py-2 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0802b8] focus-visible:ring-offset-2"
                  >
                    เรียกรถเข้ารับ
                  </Link>
                ) : null}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
