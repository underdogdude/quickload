"use client";

import type { RecipientAddress, SenderAddress } from "@quickload/shared/types";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

function formatAddress(address: SenderAddress | RecipientAddress) {
  return `${address.addressLine}, ${address.tambon}, ${address.amphoe}, ${address.province}, ${address.zipcode}`;
}

function ReviewInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const senderId = searchParams.get("senderId") ?? "";
  const recipientId = searchParams.get("recipientId") ?? "";
  const shippingMode = searchParams.get("shippingMode") === "pickup" ? "pickup" : "branch";
  const autoPrint = searchParams.get("autoPrint") === "1";
  const weightGram = searchParams.get("weightGram") ?? "";
  const widthCm = searchParams.get("widthCm") ?? "";
  const lengthCm = searchParams.get("lengthCm") ?? "";
  const heightCm = searchParams.get("heightCm") ?? "";
  const parcelType = searchParams.get("parcelType") ?? "";
  const note = searchParams.get("note") ?? "";

  const [sender, setSender] = useState<SenderAddress | null>(null);
  const [recipient, setRecipient] = useState<RecipientAddress | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValidInput = useMemo(() => {
    const toPositive = (v: string) => Number(v) > 0;
    return Boolean(
      senderId &&
        recipientId &&
        parcelType.trim() &&
        toPositive(weightGram) &&
        toPositive(widthCm) &&
        toPositive(lengthCm) &&
        toPositive(heightCm),
    );
  }, [heightCm, lengthCm, parcelType, recipientId, senderId, weightGram, widthCm]);

  useEffect(() => {
    if (!isValidInput) {
      router.replace("/send");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [senderRes, recipientRes] = await Promise.all([
          fetch(`/api/sender-addresses/${encodeURIComponent(senderId)}`),
          fetch(`/api/recipient-addresses/${encodeURIComponent(recipientId)}`),
        ]);
        const senderJson = (await senderRes.json()) as { ok?: boolean; data?: SenderAddress; error?: string };
        const recipientJson = (await recipientRes.json()) as { ok?: boolean; data?: RecipientAddress; error?: string };
        if (cancelled) return;
        if (!senderRes.ok || !senderJson.ok || !senderJson.data) {
          setError(senderJson.error ?? "ไม่พบข้อมูลผู้ส่ง");
          return;
        }
        if (!recipientRes.ok || !recipientJson.ok || !recipientJson.data) {
          setError(recipientJson.error ?? "ไม่พบข้อมูลผู้รับ");
          return;
        }
        setSender(senderJson.data);
        setRecipient(recipientJson.data);
      } catch {
        if (!cancelled) setError("โหลดข้อมูลสรุปไม่สำเร็จ");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isValidInput, recipientId, router, senderId]);

  async function onConfirmCreateOrder() {
    if (!sender || !recipient || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/parcels/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId,
          recipientId,
          shippingMode,
          autoPrint,
          weightGram,
          widthCm,
          lengthCm,
          heightCm,
          parcelType,
          note,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; data?: { id?: string; trackingId?: string }; error?: string };
      if (!res.ok || !json.ok || !json.data?.id || !json.data?.trackingId) {
        setError(json.error ?? "สร้างออเดอร์ไม่สำเร็จ");
        return;
      }
      const params = new URLSearchParams({
        parcelId: json.data.id,
        trackingId: json.data.trackingId,
      });
      router.replace(`/send/success?${params.toString()}`);
    } catch {
      setError("สร้างออเดอร์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 pb-36">
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
          <h1 className="text-3xl font-bold leading-none">สรุปคำสั่งซื้อ</h1>
          <p className="mt-1 text-sm text-white/80">ตรวจสอบข้อมูลก่อนสร้างออเดอร์</p>
        </div>
      </section>

      <section className="-mt-8 px-6">
        <div className="mx-auto w-full max-w-lg space-y-4">
          {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div> : null}
          <div className="rounded-lg bg-white p-4 shadow-sm">
            {loading ? (
              <p className="text-sm text-slate-500">กำลังโหลดข้อมูล...</p>
            ) : (
              <div className="space-y-4 text-sm text-slate-800">
                <div>
                  <p className="text-xs text-slate-500">ผู้ส่ง</p>
                  <p className="font-medium">{sender?.contactName} | {sender?.phone}</p>
                  <p className="text-xs text-slate-500">{sender ? formatAddress(sender) : "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">ผู้รับ</p>
                  <p className="font-medium">{recipient?.contactName} | {recipient?.phone}</p>
                  <p className="text-xs text-slate-500">{recipient ? formatAddress(recipient) : "-"}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3">
                  <p>รูปแบบการส่ง: {shippingMode === "pickup" ? "เรียกรถรับพัสดุ" : "ส่งที่สาขาไปรษณีย์ไทย"}</p>
                  <p>พิมพ์ใบปะหน้า: {autoPrint ? "อัตโนมัติ" : "ปิด"}</p>
                  <p>น้ำหนัก: {weightGram} กรัม</p>
                  <p>ขนาด: {widthCm} x {lengthCm} x {heightCm} ซม.</p>
                  <p className="col-span-2">ประเภทพัสดุ: {parcelType}</p>
                  {note ? <p className="col-span-2">หมายเหตุ: {note}</p> : null}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 bg-[#ECECEC] px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 shadow-[0_-6px_20px_rgba(15,23,42,0.08)]">
        <div className="mx-auto w-full max-w-lg">
          <button
            type="button"
            disabled={loading || submitting || !sender || !recipient}
            onClick={onConfirmCreateOrder}
            className="w-full rounded-full bg-[#2726F5] px-6 py-3 text-base font-semibold text-white shadow-[0_6px_14px_rgba(39,38,245,0.35)] disabled:cursor-not-allowed disabled:bg-slate-400 disabled:shadow-none"
          >
            {submitting ? "กำลังสร้างออเดอร์..." : "ยืนยันสร้างออเดอร์"}
          </button>
        </div>
      </div>
    </main>
  );
}

export default function SendReviewPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-100 p-6">
          <p className="text-sm text-slate-600">กำลังโหลด...</p>
        </main>
      }
    >
      <ReviewInner />
    </Suspense>
  );
}

