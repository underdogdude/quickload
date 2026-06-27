"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SendLink } from "@/lib/send-access-ui";

type OutstandingItem = {
  parcelId: string;
  displayCode: string;
  routeLabel: string;
  outstanding: number;
  shippingFee: number;
  smsFee: number;
  insuranceFee: number;
  status: string;
  updatedAt: string | null;
};

type OutstandingResponse = {
  ok?: boolean;
  data?: {
    totalOutstanding: number;
    itemCount: number;
    updatedAt: string;
    items: OutstandingItem[];
  };
  error?: string;
};

type HistoryItem = {
  paymentId: string;
  parcelId: string;
  displayCode: string;
  destination: string | null;
  senderName: string | null;
  recipientName: string | null;
  amount: string;
  currency: string;
  paymentMethod: string;
  provider: string;
  paidAt: string;
};

type HistoryResponse = {
  ok?: boolean;
  data?: {
    totalPaid: number;
    itemCount: number;
    items: HistoryItem[];
  };
  error?: string;
};

function formatTHB(n: number) {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatUpdatedAt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function paymentMethodLabel(method: string) {
  if (method === "promptpay") return "PromptPay";
  return method;
}

function parcelStatusLabel(status: string): string {
  if (status === "awaiting_actual_weight") return "รอลงทะเบียน/น้ำหนักจริง";
  if (status === "pending_payment") return "รอการชำระเงิน";
  if (status === "paid") return "ลงทะเบียนแล้ว";
  if (status === "registered") return "ลงทะเบียนแล้ว";
  if (status === "at_destination_post") return "ถึงปลายทาง/รอรับที่ไปรษณีย์";
  if (status === "in_transit") return "อยู่ระหว่างขนส่ง";
  if (status === "delivered") return "จัดส่งสำเร็จ";
  if (status === "returning") return "อยู่ระหว่างส่งคืน";
  if (status === "failed") return "จัดส่งไม่สำเร็จ";
  if (status === "canceled") return "ยกเลิกแล้ว";
  if (status === "draft") return "ร่าง";
  return status;
}

function buildPayAllHref(items: OutstandingItem[]): string {
  if (items.length === 1) {
    return `/pay/${encodeURIComponent(items[0].parcelId)}`;
  }
  return "/pay/all";
}

function parcelStatusBadgeClass(status: string): string {
  if (status === "awaiting_actual_weight") return "border-slate-200 bg-slate-50 text-slate-800";
  if (status === "pending_payment") return "border-amber-200 bg-amber-50 text-amber-900";
  if (status === "paid") return "border-indigo-200 bg-indigo-50 text-indigo-900";
  if (status === "registered") return "border-indigo-200 bg-indigo-50 text-indigo-900";
  if (status === "at_destination_post") return "border-blue-200 bg-blue-50 text-blue-900";
  if (status === "in_transit") return "border-sky-200 bg-sky-50 text-sky-900";
  if (status === "delivered") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "returning") return "border-orange-200 bg-orange-50 text-orange-900";
  if (status === "failed") return "border-rose-200 bg-rose-50 text-rose-900";
  if (status === "canceled") return "border-rose-200 bg-rose-50 text-rose-900";
  if (status === "draft") return "border-slate-200 bg-slate-50 text-slate-700";
  return "border-slate-200 bg-slate-50 text-slate-800";
}

export default function PaymentPage() {
  const [tab, setTab] = useState<"outstanding" | "history">("outstanding");

  const [outstandingLoading, setOutstandingLoading] = useState(true);
  const [outstandingError, setOutstandingError] = useState<string | null>(null);
  const [items, setItems] = useState<OutstandingItem[]>([]);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);

  const loadOutstanding = useCallback(async () => {
    setOutstandingError(null);
    setOutstandingLoading(true);
    try {
      const res = await fetch("/api/payment/outstanding");
      const json = (await res.json()) as OutstandingResponse;
      if (!res.ok || !json.ok || !json.data) {
        setOutstandingError(json.error ?? "โหลดข้อมูลไม่สำเร็จ");
        setItems([]);
        setTotalOutstanding(0);
        return;
      }
      setItems(json.data.items);
      setTotalOutstanding(json.data.totalOutstanding);
      setUpdatedAt(json.data.updatedAt);
    } catch {
      setOutstandingError("โหลดข้อมูลไม่สำเร็จ");
      setItems([]);
      setTotalOutstanding(0);
    } finally {
      setOutstandingLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOutstanding();
  }, [loadOutstanding]);

  useEffect(() => {
    if (tab !== "history") return;
    let cancelled = false;
    (async () => {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const res = await fetch("/api/payment/history");
        const json = (await res.json()) as HistoryResponse;
        if (cancelled) return;
        if (!res.ok || !json.ok || !json.data) {
          setHistoryError(json.error ?? "โหลดประวัติไม่สำเร็จ");
          setHistoryItems([]);
          return;
        }
        setHistoryItems(json.data.items);
      } catch {
        if (!cancelled) {
          setHistoryError("โหลดประวัติไม่สำเร็จ");
          setHistoryItems([]);
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const tabError = tab === "outstanding" ? outstandingError : historyError;

  return (
    <main className="min-h-screen bg-slate-100 pb-28">
      <section className="bg-[#2726F5] px-6 pb-14 pt-10 text-white">
        <div className="mx-auto w-full max-w-lg">
          <h1 className="text-3xl font-bold leading-none">ชำระเงิน</h1>
          <p className="mt-1 text-sm text-white/80">ตรวจสอบยอดคงค้างและสถานะการชำระเงิน</p>
        </div>
      </section>

      <section className="-mt-8 px-6">
        <div className="mx-auto w-full max-w-lg space-y-4">
          {tabError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
              {tabError}
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
            <>
              <article className="rounded-md bg-white p-5 shadow-sm ring-1 ring-slate-200/80">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-slate-500">ยอดค้างชำระทั้งหมด</p>
                  {!outstandingLoading && items.length > 0 ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-medium text-rose-700">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        fill="none"
                        viewBox="0 0 24 24"
                        className="shrink-0 text-rose-600"
                        aria-hidden
                      >
                        <path
                          d="M4 8h16v12H4V8Zm0 0 8-4 8 4M9 12h6"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      ค้างชำระ {items.length} รายการ
                    </span>
                  ) : null}
                </div>
                {outstandingLoading ? (
                  <div className="mt-3 space-y-2">
                    <div className="h-10 w-48 animate-pulse rounded-lg bg-slate-100" />
                    <div className="h-4 w-56 animate-pulse rounded bg-slate-100" />
                    <div className="mt-2 h-12 w-full animate-pulse rounded-xl bg-slate-100" />
                  </div>
                ) : (
                  <>
                    <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
                      ฿ {formatTHB(totalOutstanding)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      อัพเดทล่าสุด {updatedAt ? formatUpdatedAt(updatedAt) : "—"} น.
                    </p>
                    {items.length > 0 ? (
                      <Link
                        href={buildPayAllHref(items)}
                        className="mt-4 flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#2726F5] px-4 py-3.5 text-[15px] font-semibold leading-snug text-white shadow-[0_8px_22px_rgba(39,38,245,0.30)] transition hover:bg-[#1f1ed4] active:scale-[0.99]"
                      >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="18"
                            height="18"
                            fill="none"
                            viewBox="0 0 24 24"
                            className="shrink-0"
                            aria-hidden
                          >
                            <path
                              d="M3 7h18v10H3V7Zm0 4h18M7 11h.01M11 11h2"
                              stroke="currentColor"
                              strokeWidth="1.75"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                          <span className="text-center">
                            ชำระยอดค้างทั้งหมด{" "}
                            <span className="tabular-nums">{formatTHB(totalOutstanding)}</span> บาท
                        </span>
                      </Link>
                    ) : (
                      <div className="mt-3 space-y-1">
                        <p className="text-sm text-slate-600">ไม่มียอดค้างชำระ</p>
                        <p className="text-xs text-slate-500">
                          ยอดค้างชำระจะแสดงเมื่อไปรษณีย์ไทยส่งราคาจริง (หลังลงทะเบียน/ชั่งน้ำหนักที่สาขา) ผ่าน webhook
                        </p>
                      </div>
                    )}
                  </>
                )}
              </article>

              {!outstandingLoading && items.length > 0 ? (
                <div id="outstanding-list" className="space-y-3">
                  <h2 className="px-0.5 text-sm font-semibold text-slate-800">รายการค้างชำระ</h2>
                  {items.map((it) => (
                    <article
                      key={it.parcelId}
                      className="overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-slate-200/80"
                    >
                      <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="truncate text-lg font-medium text-slate-900">{it.displayCode}</p>
                          <span
                            className={`inline-flex shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${parcelStatusBadgeClass(it.status)}`}
                          >
                            {parcelStatusLabel(it.status)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{it.routeLabel}</p>
                        {it.updatedAt ? (
                          <p className="mt-1 text-[11px] text-slate-400">
                            อัปเดตพัสดุ {formatUpdatedAt(it.updatedAt)} น.
                          </p>
                        ) : null}
                      </div>
                      <div className="px-4 py-3">
                        <ul className="space-y-1.5 text-xs text-slate-600">
                          <li className="flex justify-between gap-2">
                            <span>ค่าขนส่ง</span>
                            <span className="font-medium text-slate-800">฿ {formatTHB(it.shippingFee)}</span>
                          </li>
                          <li className="flex justify-between gap-2">
                            <span>ค่าประกันสินค้า</span>
                            <span className="font-medium text-slate-800">฿ {formatTHB(it.insuranceFee)}</span>
                          </li>
                        </ul>
                        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                          <span className="text-sm font-medium text-slate-700">ยอดต้องชำระ</span>
                          <span className="text-xl font-medium text-[#2726F5]">฿ {formatTHB(it.outstanding)}</span>
                        </div>
                        <Link
                          href={`/pay/${encodeURIComponent(it.parcelId)}`}
                          className="my-4 flex w-full items-center justify-center gap-2 rounded-md border border-[#2726F5] bg-transparent px-4 py-2 text-sm font-medium text-[#2726F5] transition hover:bg-[#2726F5]/5"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" aria-hidden>
                            <path d="M3 7h18v10H3V7Zm0 4h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                          ไปชำระเงิน
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}

              {outstandingLoading ? (
                <div className="space-y-3">
                  <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
                  {[0, 1].map((i) => (
                    <article
                      key={`outstanding-skeleton-${i}`}
                      className="overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-slate-200/80"
                    >
                      <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="h-5 w-36 animate-pulse rounded bg-slate-200" />
                          <div className="h-5 w-20 animate-pulse rounded-full bg-slate-200" />
                        </div>
                        <div className="mt-2 h-3 w-48 animate-pulse rounded bg-slate-200" />
                        <div className="mt-2 h-3 w-40 animate-pulse rounded bg-slate-200" />
                      </div>
                      <div className="space-y-2 px-4 py-3">
                        <div className="flex items-center justify-between">
                          <div className="h-3 w-20 animate-pulse rounded bg-slate-200" />
                          <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
                          <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
                        </div>
                        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                          <div className="h-4 w-20 animate-pulse rounded bg-slate-200" />
                          <div className="h-6 w-24 animate-pulse rounded bg-slate-200" />
                        </div>
                        <div className="my-4 h-9 w-full animate-pulse rounded-md bg-slate-200" />
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <Link
                  href="/parcels"
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-transparent px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  ดูรายการพัสดุ
                </Link>
                <SendLink className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#2726F5] bg-transparent px-4 py-2.5 text-sm font-medium text-[#2726F5] transition hover:bg-[#2726F5]/5 active:bg-[#2726F5]/10">
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" aria-hidden className="shrink-0">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                  </svg>
                  สร้างรายการใหม่
                </SendLink>
              </div>
            </>
          ) : (
            <>
              {!historyLoading && historyItems.length === 0 && !historyError ? (
                <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80">
                  <p className="text-sm text-slate-600">ยังไม่มีประวัติการชำระเงินสำเร็จ</p>
                  <p className="mt-1 text-xs text-slate-500">
                    เมื่อชำระผ่าน PromptPay สำเร็จ รายการจะปรากฏที่นี่
                  </p>
                </article>
              ) : null}

              {historyLoading ? (
                <div className="space-y-3">
                  <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
                  {[0, 1, 2].map((i) => (
                    <div
                      key={`history-skeleton-${i}`}
                      className="rounded-md border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="h-5 w-20 animate-pulse rounded-full bg-slate-200" />
                          <div className="mt-2 h-5 w-36 animate-pulse rounded bg-slate-200" />
                          <div className="mt-2 h-3 w-40 animate-pulse rounded bg-slate-200" />
                          <div className="mt-2 h-3 w-28 animate-pulse rounded bg-slate-200" />
                        </div>
                        <div className="w-20 shrink-0">
                          <div className="ml-auto h-6 w-20 animate-pulse rounded bg-slate-200" />
                          <div className="mt-2 ml-auto h-3 w-16 animate-pulse rounded bg-slate-200" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {!historyLoading && historyItems.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-0.5">
                    <h2 className="text-sm font-semibold text-slate-900">ประวัติการชำระเงิน</h2>
                    <p className="text-xs font-medium text-slate-600">{historyItems.length} รายการ</p>
                  </div>
                  {historyItems.map((h) => (
                    <Link
                      key={h.paymentId}
                      href={`/parcels/${h.parcelId}`}
                      className="block rounded-md border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition hover:border-slate-300 hover:shadow-[0_10px_28px_rgba(15,23,42,0.10)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            ชำระสำเร็จ
                          </div>
                          <p className="mt-2 truncate text-xl font-medium text-neutral-900">
                            {h.displayCode}
                          </p>
                          <p className="mt-1 truncate text-xs text-slate-500">
                            {(h.senderName || "ผู้ส่ง") + " "}
                            <span className="px-1">→</span>
                            {" " + (h.recipientName || h.destination || "ผู้รับ")}
                          </p>
                          <p className="mt-2 text-[11px] text-slate-400">
                            {paymentMethodLabel(h.paymentMethod)}
                            {h.provider ? ` · ${h.provider}` : ""}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-xl font-medium text-emerald-600">฿ {formatTHB(Number(h.amount))}</p>
                          <p className="mt-1 text-[11px] text-slate-500">{formatUpdatedAt(h.paidAt)} น.</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <Link
                  href="/parcels"
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-transparent px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  ดูรายการพัสดุ
                </Link>
                <SendLink className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#2726F5] bg-transparent px-4 py-2.5 text-sm font-medium text-[#2726F5] transition hover:bg-[#2726F5]/5 active:bg-[#2726F5]/10">
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" aria-hidden className="shrink-0">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                  </svg>
                  สร้างรายการใหม่
                </SendLink>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
