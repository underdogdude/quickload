"use client";

import type { SenderAddress } from "@quickload/shared/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { readApiJson } from "@/lib/api-json";
import type { CreatedParcel } from "@/lib/parcel-order-client";
import {
  readPickupDraft,
  writePickupDraft,
} from "@/lib/pickup-draft-client";
import { PickupParcelRegistration } from "../pickup-parcel-registration";

type EligibleParcelResponse = {
  id: string;
};

function pickupHref(senderAddressId: string | null) {
  return senderAddressId
    ? `/pickup?senderId=${encodeURIComponent(senderAddressId)}`
    : "/pickup";
}

export function PickupRegisterClient({
  senderAddressId,
}: {
  senderAddressId: string | null;
}) {
  const router = useRouter();
  const [senderAddresses, setSenderAddresses] = useState<SenderAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    window.requestAnimationFrame(() => headingRef.current?.focus());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/sender-addresses", { cache: "no-store" });
        const json = await readApiJson<{
          ok?: boolean;
          data?: SenderAddress[];
          error?: string;
        }>(
          response,
          "โหลดที่อยู่เข้ารับพัสดุไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
        );
        if (cancelled) return;
        if (!response.ok || !json.ok) {
          throw new Error(json.error || "โหลดที่อยู่เข้ารับพัสดุไม่สำเร็จ");
        }
        setSenderAddresses(json.data ?? []);
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "โหลดที่อยู่เข้ารับพัสดุไม่สำเร็จ",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sender = useMemo(
    () =>
      (senderAddressId
        ? senderAddresses.find((address) => address.id === senderAddressId)
        : null) ??
      senderAddresses[0] ??
      null,
    [senderAddressId, senderAddresses],
  );
  const backHref = pickupHref(sender?.id ?? senderAddressId);

  async function handleCreated(created: CreatedParcel) {
    const currentDraft = readPickupDraft();
    let createdParcelAvailable = false;
    try {
      const response = await fetch("/api/pickup/eligible-parcels", {
        cache: "no-store",
      });
      const json = await readApiJson<{
        ok?: boolean;
        data?: { items?: EligibleParcelResponse[] };
        error?: string;
      }>(response, "โหลดพัสดุที่สร้างใหม่ไม่สำเร็จ");
      createdParcelAvailable = Boolean(
        response.ok &&
          json.ok &&
          json.data?.items?.some((item) => item.id === created.id),
      );
    } catch {
      createdParcelAvailable = false;
    }

    writePickupDraft({
      senderAddressId: sender?.id ?? currentDraft.senderAddressId,
      selectedParcelIds: createdParcelAvailable
        ? [...new Set([...currentDraft.selectedParcelIds, created.id])]
        : currentDraft.selectedParcelIds,
      remark: currentDraft.remark,
      announcement: createdParcelAvailable
        ? `ลงทะเบียนพัสดุ ${created.trackingId || "ใหม่"} สำเร็จและเลือกไว้แล้ว`
        : `ลงทะเบียนพัสดุ ${created.trackingId || "ใหม่"} สำเร็จแล้ว กรุณาโหลดรายการอีกครั้ง`,
    });
    router.replace(pickupHref(sender?.id ?? senderAddressId));
  }

  return (
    <main className="pickup-child-route pickup-surface min-h-screen bg-slate-100 pb-24">
      <section className="bg-[#0802b8] px-6 pb-12 pt-8 text-white">
        <div className="mx-auto w-full max-w-lg">
          <Link
            href={backHref}
            className="mb-3 inline-flex items-center gap-1 rounded-full border border-white/40 px-3 py-1.5 text-xs font-medium text-white/95 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#0802b8]"
            aria-label="กลับไปเลือกพัสดุ"
          >
            <span aria-hidden>←</span>
            <span>กลับ</span>
          </Link>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-3xl font-bold leading-tight text-balance focus:outline-none"
          >
            ลงทะเบียนพัสดุใหม่
          </h1>
          <p className="mt-1 text-base leading-6 text-white/90">
            สร้างพัสดุสำหรับให้ไปรษณีย์เข้ารับ
          </p>
        </div>
      </section>

      <div className="-mt-7 px-6">
        <div className="mx-auto w-full max-w-lg">
          <section className="rounded-lg bg-white p-4 shadow-sm">
            {loading ? (
              <div className="space-y-3" aria-label="กำลังโหลดข้อมูล">
                {[0, 1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="h-14 animate-pulse rounded-lg bg-slate-200 motion-reduce:animate-none"
                  />
                ))}
              </div>
            ) : error ? (
              <div className="rounded-lg bg-rose-50 p-4" role="alert">
                <p className="text-sm text-rose-800">{error}</p>
                <Link
                  href={backHref}
                  className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white"
                >
                  กลับไปเลือกที่อยู่
                </Link>
              </div>
            ) : sender ? (
              <PickupParcelRegistration
                active
                sender={sender}
                onCreated={handleCreated}
              />
            ) : (
              <div className="px-2 py-8 text-center">
                <p className="font-medium text-slate-900">
                  กรุณาเลือกที่อยู่เข้ารับก่อน
                </p>
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  ที่อยู่นี้จะใช้เป็นข้อมูลผู้ส่งของพัสดุ
                </p>
                <Link
                  href="/pickup"
                  className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-[#0802b8] px-4 py-2 text-sm font-medium text-white"
                >
                  กลับไปเลือกที่อยู่
                </Link>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
