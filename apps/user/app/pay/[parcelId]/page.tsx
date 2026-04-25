"use client";

import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { use, useCallback, useEffect, useRef, useState } from "react";

type ChargeStatus = "pending" | "succeeded" | "failed" | "expired" | "canceled";

type ChargeData = {
  paymentId: string;
  status: ChargeStatus;
  amount: string;
  currency: string;
  qrPayload: string | null;
  expiresAt: string | null;
  paidAt: string | null;
  parcelId: string;
  trackingId: string | null;
};

const POLL_INTERVAL_MS = 2500;

export default function PayPage({ params }: { params: { parcelId: string } }) {
  const { parcelId } = params;
  const router = useRouter();

  const [charge, setCharge] = useState<ChargeData | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canceledRef = useRef(false);

  const renderQr = useCallback(async (payload: string) => {
    // Beam may return the QR as a pre-rendered base64 PNG data URL; use it as-is.
    // Otherwise treat the payload as an EMVCo PromptPay string and render to a
    // data URL ourselves.
    if (payload.startsWith("data:image/")) {
      setQrDataUrl(payload);
      return;
    }
    try {
      const url = await QRCode.toDataURL(payload, { width: 320, margin: 1 });
      setQrDataUrl(url);
    } catch {
      setQrDataUrl(null);
    }
  }, []);

  const createCharge = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/payment/charges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parcelId }),
      });
      const json = (await res.json()) as
        | { ok: true; data: Omit<ChargeData, "parcelId" | "trackingId" | "paidAt"> }
        | { ok: false; error: string };
      if (!res.ok || !("ok" in json) || !json.ok) {
        setError(("error" in json && json.error) || "ไม่สามารถสร้าง QR ได้");
        return;
      }
      // After create, fetch full status for parcelId + trackingId.
      const statusRes = await fetch(`/api/payment/charges/${json.data.paymentId}`);
      const statusJson = (await statusRes.json()) as { ok: true; data: ChargeData } | { ok: false; error: string };
      if (!statusRes.ok || !("ok" in statusJson) || !statusJson.ok) {
        setError(("error" in statusJson && statusJson.error) || "ไม่สามารถโหลดสถานะได้");
        return;
      }
      setCharge(statusJson.data);
      if (statusJson.data.qrPayload) {
        await renderQr(statusJson.data.qrPayload);
      }
    } catch {
      setError("เครือข่ายผิดพลาด กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  }, [parcelId, renderQr]);

  useEffect(() => {
    createCharge();
  }, [createCharge]);

  // Poll.
  useEffect(() => {
    if (!charge || charge.status !== "pending") return;
    if (canceledRef.current) return;
    const tick = async () => {
      if (document.hidden) {
        pollTimer.current = setTimeout(tick, POLL_INTERVAL_MS);
        return;
      }
      try {
        const res = await fetch(`/api/payment/charges/${charge.paymentId}`);
        if (res.ok) {
          const json = (await res.json()) as { ok: true; data: ChargeData };
          if (json.ok) {
            setCharge(json.data);
            if (json.data.status === "succeeded") return;
          }
        }
      } catch {
        // Swallow transient errors; keep polling.
      }
      pollTimer.current = setTimeout(tick, POLL_INTERVAL_MS);
    };
    pollTimer.current = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [charge]);

  // On success → redirect after brief flash.
  useEffect(() => {
    if (charge?.status !== "succeeded") return;
    const t = setTimeout(() => {
      const qp = new URLSearchParams({
        parcelId: charge.parcelId,
        trackingId: charge.trackingId ?? "",
      });
      router.replace(`/send/success?${qp.toString()}`);
    }, 400);
    return () => clearTimeout(t);
  }, [charge, router]);

  // Countdown tick.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleCancel = async () => {
    if (!charge || canceling) return;
    setCanceling(true);
    canceledRef.current = true;
    try {
      await fetch(`/api/payment/charges/${charge.paymentId}/cancel`, { method: "POST" });
    } catch {
      // ignore
    } finally {
      router.replace("/send/review");
    }
  };

  const handleSimulate = async () => {
    if (!charge || simulating) return;
    setSimulating(true);
    try {
      await fetch(`/api/payment/dev-simulate/${charge.paymentId}`, { method: "POST" });
    } catch {
      // ignore — poll will catch state change anyway
    } finally {
      setSimulating(false);
    }
  };

  const remainingSeconds = (() => {
    if (!charge?.expiresAt) return null;
    const ms = new Date(charge.expiresAt).getTime() - now;
    return Math.max(0, Math.floor(ms / 1000));
  })();
  const mm = remainingSeconds != null ? String(Math.floor(remainingSeconds / 60)).padStart(2, "0") : "--";
  const ss = remainingSeconds != null ? String(remainingSeconds % 60).padStart(2, "0") : "--";

  const formattedAmount =
    charge?.amount != null
      ? new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
          Number(charge.amount),
        )
      : "-";

  const showMockButton = process.env.NEXT_PUBLIC_PAYMENT_MOCK === "1";

  return (
    <main className="min-h-screen bg-slate-100 pb-36">
      <section className="bg-[#2726F5] px-6 pb-14 pt-10 text-white">
        <div className="mx-auto w-full max-w-lg">
          <button
            type="button"
            onClick={handleCancel}
            className="mb-3 inline-flex items-center gap-1 rounded-full border border-white/40 px-3 py-1.5 text-xs font-medium text-white/95"
            aria-label="กลับไปหน้าสรุปคำสั่งซื้อ"
          >
            <span aria-hidden>←</span>
            <span>กลับ</span>
          </button>
          <h1 className="text-3xl font-bold leading-none">ชำระเงิน</h1>
          <p className="mt-1 text-sm text-white/80">สแกน QR ด้วยแอปธนาคารของคุณ</p>
        </div>
      </section>

      <section className="-mt-8 px-6">
        <div className="mx-auto w-full max-w-lg space-y-4">
          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <p>{error}</p>
              <button
                type="button"
                onClick={createCharge}
                className="mt-2 inline-flex items-center rounded-full border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700"
              >
                สร้าง QR ใหม่
              </button>
            </div>
          ) : null}

          <div className="rounded-lg bg-white p-5 shadow-sm">
            {loading && !charge ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <div className="h-9 w-36 animate-pulse rounded-lg bg-slate-100" />
                <div className="h-64 w-64 animate-pulse rounded-lg bg-slate-100" />
              </div>
            ) : charge?.status === "pending" ? (
              <div className="flex flex-col items-center gap-3">
                <p className="text-sm font-medium text-slate-500">ยอดที่ต้องชำระ</p>
                <p className="text-4xl font-semibold leading-none text-[#2726F5]">฿ {formattedAmount}</p>
                {charge.trackingId ? (
                  <p className="text-xs text-slate-500">หมายเลขพัสดุ: {charge.trackingId}</p>
                ) : null}
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`QR PromptPay สำหรับยอด ${formattedAmount} บาท`}
                    className="h-64 w-64 rounded-lg border border-slate-200"
                  />
                ) : (
                  <div className="h-64 w-64 animate-pulse rounded-lg bg-slate-100" />
                )}
                <p className="text-xs font-medium text-slate-500">PromptPay</p>
                <p className="text-sm text-slate-600">
                  เหลือเวลา <span className="font-semibold text-slate-900">{mm}:{ss}</span>
                </p>
                {charge.qrPayload && !charge.qrPayload.startsWith("data:image/") ? (
                  <p className="break-all text-center text-[10px] text-slate-400 select-all">
                    {charge.qrPayload}
                  </p>
                ) : null}

                {showMockButton ? (
                  <button
                    type="button"
                    onClick={handleSimulate}
                    disabled={simulating}
                    className="mt-2 inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800 disabled:opacity-50"
                  >
                    [DEV] {simulating ? "กำลังจำลอง..." : "จำลองการชำระสำเร็จ"}
                  </button>
                ) : null}
              </div>
            ) : charge?.status === "succeeded" ? (
              <div className="py-8 text-center">
                <p className="text-xl font-semibold text-emerald-600">ชำระเงินสำเร็จ</p>
                <p className="mt-1 text-sm text-slate-500">กำลังพาไปยังหน้าสรุป...</p>
              </div>
            ) : charge?.status === "expired" ? (
              <div className="py-8 text-center">
                <p className="text-lg font-semibold text-slate-800">QR หมดอายุแล้ว</p>
                <button
                  type="button"
                  onClick={createCharge}
                  className="mt-3 inline-flex items-center rounded-full bg-[#2726F5] px-4 py-2 text-sm font-medium text-white"
                >
                  สร้าง QR ใหม่
                </button>
              </div>
            ) : charge?.status === "failed" ? (
              <div className="py-8 text-center">
                <p className="text-lg font-semibold text-rose-700">การชำระเงินล้มเหลว</p>
                <button
                  type="button"
                  onClick={createCharge}
                  className="mt-3 inline-flex items-center rounded-full bg-[#2726F5] px-4 py-2 text-sm font-medium text-white"
                >
                  สร้าง QR ใหม่
                </button>
              </div>
            ) : charge?.status === "canceled" ? (
              <div className="py-8 text-center">
                <p className="text-lg font-semibold text-slate-800">ยกเลิกการชำระเงินแล้ว</p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 bg-slate-100 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 shadow-[0_-6px_20px_rgba(15,23,42,0.08)]">
        <div className="mx-auto w-full max-w-lg">
          <button
            type="button"
            onClick={handleCancel}
            disabled={canceling || charge?.status === "succeeded"}
            className="w-full rounded-full border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-700 disabled:opacity-50"
          >
            ยกเลิก
          </button>
        </div>
      </div>
    </main>
  );
}
