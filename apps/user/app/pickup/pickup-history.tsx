"use client";

import { useEffect, useRef, useState } from "react";
import { readApiJson } from "@/lib/api-json";
import type { PickupRequestDto } from "@/lib/iship-pickup";
import { pickupStatusLabel } from "@/lib/iship-pickup";

function formatThaiDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function formatProgressDateTime(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function effectiveStatus(item: PickupRequestDto): PickupRequestDto["status"] {
  if (item.status === "requested" && item.acceptedAt) return "assigned";
  return item.status;
}

function statusClass(status: PickupRequestDto["status"]) {
  if (status === "picked_up") return "bg-emerald-100 text-emerald-800";
  if (status === "cancelled" || status === "failed") return "bg-rose-100 text-rose-800";
  if (status === "unknown") return "bg-amber-100 text-amber-900";
  if (status === "assigned") return "bg-sky-100 text-sky-800";
  if (status === "submitting") return "bg-slate-200 text-slate-800";
  return "bg-indigo-100 text-indigo-800";
}

function progressStep(item: PickupRequestDto) {
  if (item.status === "picked_up") return 3;
  if (item.status === "assigned" || item.acceptedAt) return 2;
  return 1;
}

function ParcelIcon() {
  return (
    <span
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600"
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
        <path
          d="m4.5 7.5 7.5 4 7.5-4M12 11.5V20M5 7.2 12 3.5l7 3.7v9.6l-7 3.7-7-3.7V7.2Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function PickupProgress({ item }: { item: PickupRequestDto }) {
  const step = progressStep(item);
  const stages = [
    {
      label: "ส่งคำขอ",
      time: formatProgressDateTime(item.createdAt),
    },
    {
      label: "พนักงานรับงาน",
      time: step >= 2 ? formatProgressDateTime(item.acceptedAt) : null,
    },
    {
      label: "เข้ารับแล้ว",
      time:
        item.status === "picked_up"
          ? formatProgressDateTime(item.closedAt)
          : null,
    },
  ];
  const progressWidth = step === 3 ? "w-full" : step === 2 ? "w-1/2" : "w-0";

  return (
    <div className="mt-5" aria-label={`ความคืบหน้า ${step} จาก 3 ขั้น`}>
      <div className="relative">
        <span
          className="absolute left-[16.666%] right-[16.666%] top-2 h-0.5 bg-slate-200"
          aria-hidden="true"
        >
          <span
            className={`block h-full bg-[#0802b8] transition-[width] duration-200 motion-reduce:transition-none ${progressWidth}`}
          />
        </span>
        <ol className="relative grid grid-cols-3">
          {stages.map((stage, index) => {
            const reached = index + 1 <= step;
            return (
              <li key={stage.label} className="min-w-0 text-center">
                <span
                  className={`mx-auto block h-4 w-4 rounded-full border-2 ${
                    reached
                      ? "border-[#0802b8] bg-[#0802b8]"
                      : "border-slate-300 bg-white"
                  }`}
                  aria-hidden="true"
                />
                <span
                  className={`mt-2 block text-xs font-medium leading-5 ${
                    reached ? "text-slate-900" : "text-slate-500"
                  }`}
                >
                  {stage.label}
                </span>
                <span className="mt-0.5 block min-h-4 text-[10px] leading-4 text-slate-500 tabular-nums">
                  {stage.time || (reached ? "บันทึกแล้ว" : "รอดำเนินการ")}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

export function PickupHistoryItem({
  item,
  onCancelled,
}: {
  item: PickupRequestDto;
  onCancelled: (updated: PickupRequestDto) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function closeOnPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    }
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  async function cancelPickup() {
    if (cancelling) return;
    setCancelling(true);
    setError(null);
    try {
      const response = await fetch(`/api/pickup/${encodeURIComponent(item.id)}/cancel`, {
        method: "POST",
      });
      const json = await readApiJson<{
        ok?: boolean;
        data?: PickupRequestDto;
        error?: string;
      }>(
        response,
        "ระบบยกเลิกการเข้ารับยังไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง",
      );
      if (!response.ok || !json.ok || !json.data) {
        throw new Error(json.error || "ยกเลิกการเข้ารับไม่สำเร็จ");
      }
      onCancelled({
        ...json.data,
        recipientNames: json.data.recipientNames?.length
          ? json.data.recipientNames
          : item.recipientNames,
      });
      setConfirming(false);
      setMenuOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ยกเลิกการเข้ารับไม่สำเร็จ");
    } finally {
      setCancelling(false);
    }
  }

  const displayStatus = effectiveStatus(item);

  return (
    <article
      className="rounded-xl bg-white p-4 shadow-sm"
      data-testid="pickup-tracking-card"
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(displayStatus)}`}
        >
          {pickupStatusLabel(displayStatus)}
        </span>
        <div ref={menuRef} className="relative">
          <button
            ref={menuButtonRef}
            type="button"
            aria-label="ตัวเลือกคำขอเข้ารับ"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0802b8]"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="currentColor"
              aria-hidden="true"
            >
              <circle cx="12" cy="5" r="1.75" />
              <circle cx="12" cy="12" r="1.75" />
              <circle cx="12" cy="19" r="1.75" />
            </svg>
          </button>
          {menuOpen ? (
            <div
              role="menu"
              aria-label="จัดการคำขอเข้ารับ"
              className="absolute right-0 top-12 z-10 w-52 rounded-lg bg-white py-1 shadow-md ring-1 ring-slate-200"
            >
              <button
                type="button"
                role="menuitem"
                disabled={!item.canCancel}
                onClick={() => {
                  setMenuOpen(false);
                  setConfirming(true);
                  setError(null);
                }}
                className="flex min-h-11 w-full items-center px-3 py-2 text-left text-sm font-medium text-rose-700 transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0802b8] disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
              >
                ยกเลิกการเข้ารับ
              </button>
              {!item.canCancel ? (
                <p className="px-3 pb-2 text-xs leading-5 text-slate-500">
                  สถานะนี้ไม่สามารถยกเลิกได้
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-2 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">เลขที่คำขอ</p>
          <p className="mt-0.5 break-all text-xl font-bold leading-tight text-slate-950 tabular-nums">
            {item.ticketPickupId
              ? `#${item.ticketPickupId}`
              : "กำลังออกเลขที่คำขอ"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {formatThaiDateTime(item.createdAt)}
          </p>
        </div>
        <ParcelIcon />
      </div>

      <PickupProgress item={item} />

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-slate-200 pt-4 text-sm">
        <div className="min-w-0">
          <dt className="text-xs font-medium text-slate-500">
            ที่อยู่เข้ารับ
          </dt>
          <dd className="mt-1 text-sm leading-5 text-slate-800">
            {item.pickupAddressFull}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-medium text-slate-500">จำนวนพัสดุ</dt>
          <dd className="mt-1 font-medium text-slate-900 tabular-nums">
            {item.parcelCount.toLocaleString("th-TH")} ชิ้น
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-medium text-slate-500">ผู้รับ</dt>
          <dd className="mt-1 leading-5 text-slate-800">
            {item.recipientNames?.length
              ? item.recipientNames.join(" · ")
              : "-"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-medium text-slate-500">เวลานัดรับ</dt>
          <dd className="mt-1 leading-5 text-slate-800">
            {item.timeoutAtText || "รอแจ้งเวลา"}
          </dd>
        </div>
      </dl>

      {item.staffInfoName ||
      item.staffInfoPhone ||
      item.ticketMessage ? (
        <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
          {item.staffInfoName || item.staffInfoPhone ? (
            <div className={item.ticketMessage ? "min-w-0" : "col-span-2 min-w-0"}>
              <dt className="text-xs font-medium text-slate-500">
                พนักงานเข้ารับ
              </dt>
              <dd className="mt-1 text-sm leading-5 text-slate-800">
                {[item.staffInfoName, item.staffInfoPhone]
                  .filter(Boolean)
                  .join(" · ")}
              </dd>
            </div>
          ) : null}
          {item.ticketMessage ? (
            <div
              className={
                item.staffInfoName || item.staffInfoPhone
                  ? "min-w-0"
                  : "col-span-2 min-w-0"
              }
            >
              <dt className="text-xs font-medium text-slate-500">
                ข้อมูลการเข้ารับ
              </dt>
              <dd className="mt-1 text-sm leading-5 text-slate-700">
                {item.ticketMessage}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {item.failureMessage ? (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800" role="status">
          {item.failureMessage}
        </p>
      ) : null}

      {confirming ? (
        <div className="mt-4 rounded-lg bg-rose-50 p-3" role="group" aria-label="ยืนยันการยกเลิก">
          <p className="text-sm font-medium text-rose-900">ยกเลิกคำขอเข้ารับรายการนี้?</p>
          <p className="mt-1 text-sm text-rose-800">ระบบจะส่งคำขอยกเลิกทันที</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={cancelPickup}
              disabled={cancelling}
              className="min-h-11 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cancelling ? "กำลังยกเลิก…" : "ยืนยันยกเลิก"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={cancelling}
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 disabled:opacity-60"
            >
              เก็บคำขอไว้
            </button>
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-rose-700" role="alert">{error}</p> : null}
    </article>
  );
}

export function PickupLoadingRows() {
  return (
    <div className="space-y-3" aria-label="กำลังโหลดข้อมูล">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="h-72 animate-pulse rounded-xl bg-white shadow-sm motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}
