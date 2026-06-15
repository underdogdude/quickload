"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BANK_PAYMENT_METHODS,
  DEFAULT_PAYMENT_METHOD_ID,
  getPaymentMethod,
  PROMPTPAY_METHOD_ID,
  type PaymentMethodId,
} from "@quickload/shared/payment-methods";

type ChargeStatus = "pending" | "succeeded" | "failed" | "expired" | "canceled";

type OutstandingState = "settled" | "unpaid";

type Outstanding = {
  state: OutstandingState;
  totalOwed: number;
  outstanding: number;
};

type ActionRequired = "NONE" | "REDIRECT" | "ENCODED_IMAGE";

type ChargeData = {
  paymentId: string;
  status: ChargeStatus;
  amount: string;
  currency: string;
  paymentMethod: PaymentMethodId | string;
  qrPayload: string | null;
  redirectUrl: string | null;
  actionRequired: ActionRequired;
  expiresAt: string | null;
  paidAt: string | null;
  parcelId: string;
  barcode: string | null;
  trackingId: string | null;
  outstanding: Outstanding;
};

const POLL_INTERVAL_MS = 2500;

function methodLabelTh(id: string): string {
  return getPaymentMethod(id)?.labelTh ?? id;
}

function isPromptPayCharge(charge: ChargeData | null): boolean {
  return charge?.paymentMethod === PROMPTPAY_METHOD_ID;
}

export default function PayPage({ params }: { params: { parcelId: string } }) {
  const { parcelId } = params;
  const router = useRouter();

  const [charge, setCharge] = useState<ChargeData | null>(null);
  const [promptPayQrDataUrl, setPromptPayQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [switching, setSwitching] = useState<PaymentMethodId | null>(null);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canceledRef = useRef(false);
  const switchingRef = useRef(false);
  const createChargeOnceRef = useRef(false);

  const renderPromptPayQr = useCallback(async (payload: string) => {
    // Beam may return the QR as a pre-rendered base64 PNG data URL; use it as-is.
    // Otherwise treat the payload as an EMVCo PromptPay string and render to a
    // data URL ourselves.
    if (payload.startsWith("data:image/")) {
      setPromptPayQrDataUrl(payload);
      return;
    }
    try {
      const url = await QRCode.toDataURL(payload, { width: 320, margin: 1 });
      setPromptPayQrDataUrl(url);
    } catch {
      setPromptPayQrDataUrl(null);
    }
  }, []);

  const loadChargeStatus = useCallback(
    async (paymentId: string): Promise<ChargeData | null> => {
      const statusRes = await fetch(`/api/payment/charges/${paymentId}`);
      const statusJson = (await statusRes.json()) as
        | { ok: true; data: ChargeData }
        | { ok: false; error: string };
      if (!statusRes.ok || !("ok" in statusJson) || !statusJson.ok) {
        return null;
      }
      return statusJson.data;
    },
    [],
  );

  const createCharge = useCallback(
    async (paymentMethod: string = DEFAULT_PAYMENT_METHOD_ID) => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/payment/charges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parcelId, paymentMethod }),
      });
      const json = (await res.json()) as
        | { ok: true; data: Omit<ChargeData, "parcelId" | "barcode" | "trackingId" | "paidAt" | "outstanding"> }
        | { ok: false; error: string };
      if (!res.ok || !("ok" in json) || !json.ok) {
        setError(("error" in json && json.error) || "ไม่สามารถสร้าง QR ได้");
        return;
      }
      const statusData = await loadChargeStatus(json.data.paymentId);
      if (!statusData) {
        setError("ไม่สามารถโหลดสถานะได้");
        return;
      }
      setCharge(statusData);
      if (statusData.paymentMethod === PROMPTPAY_METHOD_ID && statusData.qrPayload) {
        await renderPromptPayQr(statusData.qrPayload);
      }
    } catch {
      setError("เครือข่ายผิดพลาด กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  },
    [loadChargeStatus, parcelId, renderPromptPayQr],
  );

  useEffect(() => {
    if (createChargeOnceRef.current) return;
    createChargeOnceRef.current = true;
    createCharge();
  }, [createCharge]);

  // Poll.
  useEffect(() => {
    if (!charge || charge.status !== "pending") return;
    if (canceledRef.current) return;
    if (switchingRef.current) return;
    const tick = async () => {
      if (switchingRef.current) return;
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
            if (
              json.data.paymentMethod === PROMPTPAY_METHOD_ID &&
              json.data.qrPayload
            ) {
              void renderPromptPayQr(json.data.qrPayload);
            }
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
  }, [charge, renderPromptPayQr]);

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

  const openBankApp = useCallback((redirectUrl: string) => {
    if (typeof window === "undefined") return;
    window.location.assign(redirectUrl);
  }, []);

  const handleCancel = async () => {
    if (!charge || canceling) return;
    setCanceling(true);
    canceledRef.current = true;
    let parcelCanceled = false;
    try {
      const res = await fetch(`/api/payment/charges/${charge.paymentId}/cancel`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { parcelCanceled?: boolean };
      parcelCanceled = Boolean(json?.parcelCanceled);
    } catch {
      // ignore — fall through to the safer redirect below
    } finally {
      router.replace(parcelCanceled ? "/parcels" : "/send/review");
    }
  };

  const switchMethod = useCallback(
    async (nextMethod: PaymentMethodId) => {
      if (!charge || switching) return;
      setSwitching(nextMethod);
      switchingRef.current = true;
      setError(null);
      try {
        const res = await fetch("/api/payment/charges", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parcelId, paymentMethod: nextMethod }),
        });
        const json = (await res.json()) as
          | { ok: true; data: { paymentId: string; redirectUrl: string | null } }
          | { ok: false; error: string };
        if (!res.ok || !("ok" in json) || !json.ok) {
          setError(
            ("error" in json && json.error) || "ไม่สามารถเปิดแอปธนาคารได้",
          );
          return;
        }
        const statusData = await loadChargeStatus(json.data.paymentId);
        if (!statusData) {
          setError("ไม่สามารถโหลดสถานะได้");
          return;
        }
        setCharge(statusData);
        const redirectUrl = statusData.redirectUrl ?? json.data.redirectUrl;
        if (redirectUrl) {
          openBankApp(redirectUrl);
        } else {
          setError("ไม่พบลิงก์เปิดแอปธนาคาร กรุณาลองอีกครั้ง");
        }
      } catch {
        setError("เครือข่ายผิดพลาด กรุณาลองใหม่");
      } finally {
        switchingRef.current = false;
        setSwitching(null);
      }
    },
    [charge, loadChargeStatus, openBankApp, parcelId, switching],
  );

  const switchToPromptPay = useCallback(async () => {
    if (!charge || switching || isPromptPayCharge(charge)) return;
    setError(null);
    await createCharge(PROMPTPAY_METHOD_ID);
  }, [charge, createCharge, switching]);

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

  const formatTHB = (n: number): string =>
    new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const formattedAmount = charge?.amount != null ? formatTHB(Number(charge.amount)) : "-";

  const showMockButton = process.env.NEXT_PUBLIC_PAYMENT_MOCK === "1";

  return (
    <main className="min-h-screen bg-slate-100 pb-12">
      <section className="bg-[#2726F5] px-6 pb-14 pt-10 text-white">
        <div className="mx-auto w-full max-w-lg">
          <button
            type="button"
            onClick={() => setShowLeaveDialog(true)}
            className="mb-3 inline-flex items-center gap-1 rounded-full border border-white/40 px-3 py-1.5 text-xs font-medium text-white/95"
            aria-label="กลับไปหน้าสรุปคำสั่งซื้อ"
          >
            <span aria-hidden>←</span>
            <span>กลับ</span>
          </button>
          <h1 className="text-3xl font-bold leading-none">ชำระเงิน</h1>
          <p className="mt-1 text-sm text-white/80">สแกน QR พร้อมเพย์ หรือเลือกแอปธนาคารด้านล่าง</p>
        </div>
      </section>

      <section className="-mt-8 px-6">
        <div className="mx-auto w-full max-w-lg space-y-4">
          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => createCharge()}
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
                <p className="text-4xl font-semibold leading-none text-[#2726F5]">
                  ฿ {formatTHB(charge.outstanding.outstanding)}
                </p>
                {charge.outstanding.totalOwed > charge.outstanding.outstanding ? (
                  <p className="text-xs text-slate-500">
                    ชำระแล้ว ฿ {formatTHB(charge.outstanding.totalOwed - charge.outstanding.outstanding)} ·
                    ยอดเต็ม ฿ {formatTHB(charge.outstanding.totalOwed)}
                  </p>
                ) : null}
                {charge.barcode || charge.trackingId ? (
                  <p className="text-xs text-slate-500">หมายเลขพัสดุ: {charge.barcode || charge.trackingId}</p>
                ) : null}
                <div className="w-full max-w-[320px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-center gap-2 bg-[#123e6f] px-3 py-2 text-white">
                    <Image
                      src="/Thai_QR_Logo.svg"
                      alt="Thai QR Payment"
                      width={126}
                      height={28}
                      className="h-7 w-auto"
                      priority
                    />
                  </div>
                  <div className="flex justify-center bg-white pt-3">
                    <Image
                      src="/PromptPay-logo.png"
                      alt="PromptPay"
                      width={220}
                      height={80}
                      className="h-8 w-auto"
                    />
                  </div>
                  <div className="relative flex items-center justify-center bg-white px-4 pb-4">
                    {promptPayQrDataUrl ? (
                      <Image
                        src={promptPayQrDataUrl}
                        alt={`QR PromptPay สำหรับยอด ${formattedAmount} บาท`}
                        width={256}
                        height={256}
                        unoptimized
                        className="h-64 w-64"
                      />
                    ) : (
                      <div className="h-64 w-64 animate-pulse bg-slate-100" />
                    )}
                    <span className="pointer-events-none absolute inline-flex h-7 w-7 items-center justify-center">
                      <Image
                        src="/promp-pay-logo-square.png"
                        alt="PromptPay logo"
                        width={40}
                        height={40}
                        className="h-auto w-auto"
                      />
                    </span>
                  </div>
                </div>
                <p className="text-sm text-slate-600">
                  เหลือเวลา <span className="font-semibold text-slate-900">{mm}:{ss}</span>
                </p>

                {!isPromptPayCharge(charge) && charge.redirectUrl ? (
                  <div className="w-full max-w-xs rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-center">
                    <p className="text-sm text-slate-700">
                      กำลังชำระผ่าน {methodLabelTh(charge.paymentMethod)}
                    </p>
                    <button
                      type="button"
                      onClick={() => openBankApp(charge.redirectUrl!)}
                      className="mt-2 inline-flex w-full items-center justify-center rounded-md bg-[#2726F5] px-4 py-2.5 text-sm font-medium text-white"
                    >
                      เปิดแอป {methodLabelTh(charge.paymentMethod)} อีกครั้ง
                    </button>
                    <button
                      type="button"
                      onClick={() => void switchToPromptPay()}
                      disabled={loading || switching !== null}
                      className="mt-2 text-xs font-medium text-[#2726F5] underline disabled:opacity-50"
                    >
                      กลับไปชำระด้วยพร้อมเพย์
                    </button>
                  </div>
                ) : null}

                {isPromptPayCharge(charge) &&
                charge.qrPayload &&
                !charge.qrPayload.startsWith("data:image/") ? (
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
                  onClick={() => createCharge()}
                  disabled={loading}
                  className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#2726F5] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                  สร้าง QR ใหม่
                </button>
              </div>
            ) : charge?.status === "failed" ? (
              <div className="py-8 text-center">
                <p className="text-lg font-semibold text-rose-700">การชำระเงินล้มเหลว</p>
                <button
                  type="button"
                  onClick={() => createCharge()}
                  disabled={loading}
                  className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#2726F5] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                  สร้าง QR ใหม่
                </button>
              </div>
            ) : charge?.status === "canceled" ? (
              <div className="py-8 text-center">
                <p className="text-lg font-semibold text-slate-800">ยกเลิกการชำระเงินแล้ว</p>
              </div>
            ) : null}
          </div>

          {charge?.status === "pending" ? (
            <div className="rounded-lg bg-white p-4 shadow-sm">
              <p className="mb-3 text-sm font-medium text-slate-700">
                หรือชำระผ่านแอปธนาคาร / วอลเล็ต
              </p>
              <div className="grid grid-cols-2 gap-2">
                {BANK_PAYMENT_METHODS.map((m) => {
                  const selected = charge.paymentMethod === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => switchMethod(m.id)}
                      disabled={switching !== null}
                      aria-pressed={selected}
                      className={`flex flex-col items-start rounded-md border px-3 py-2.5 text-left transition disabled:opacity-50 ${
                        selected
                          ? "border-[#2726F5] bg-indigo-50 ring-1 ring-[#2726F5]/20"
                          : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100"
                      }`}
                    >
                      <span
                        className={`text-sm font-medium ${selected ? "text-[#2726F5]" : "text-slate-800"}`}
                      >
                        {m.labelTh}
                      </span>
                      <span className="mt-0.5 text-[11px] text-slate-500">เปิดแอปเพื่อชำระ</span>
                      {switching === m.id ? (
                        <span className="mt-1 text-[11px] text-[#2726F5]">กำลังเปิดแอป...</span>
                      ) : selected ? (
                        <span className="mt-1 text-[11px] font-medium text-[#2726F5]">
                          กำลังใช้งาน
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {showLeaveDialog ? (
        <div className="fixed inset-0 z-50 !mt-0 bg-black/50 px-6 py-10" onClick={() => setShowLeaveDialog(false)}>
          <div
            className="mx-auto mt-20 w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-payment-title"
          >
            <h2 id="leave-payment-title" className="text-base font-semibold text-slate-900">
              กำลังดำเนินการชำระเงิน
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              การชำระเงินอยู่ระหว่างการดำเนินการ หากคุณออกจากหน้านี้ คุณสามารถกลับมาชำระได้อีกครั้ง
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShowLeaveDialog(false)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"
              >
                อยู่ต่อ
              </button>
              <button
                type="button"
                onClick={() => router.push("/parcels")}
                className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white"
              >
                ออก
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
