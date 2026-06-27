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
import { PromptPaySaveQrButton } from "../promptpay-save-qr-button";

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
const PAY_SUCCESS_REDIRECT_MS = 1800;

function CheckCircleIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={props.className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function XCircleIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={props.className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function buildPaymentSuccessUrl(charge: ChargeData): string {
  const qp = new URLSearchParams({
    parcelId: charge.parcelId,
    trackingId: charge.trackingId ?? "",
    from: "payment",
  });
  return `/send/success?${qp.toString()}`;
}

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
  const initOnceRef = useRef(false);

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

  const applyChargeData = useCallback(
    async (statusData: ChargeData) => {
      setCharge(statusData);
      if (statusData.paymentMethod === PROMPTPAY_METHOD_ID && statusData.qrPayload) {
        await renderPromptPayQr(statusData.qrPayload);
      } else {
        setPromptPayQrDataUrl(null);
      }
    },
    [renderPromptPayQr],
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
      await applyChargeData(statusData);
    } catch {
      setError("เครือข่ายผิดพลาด กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  },
    [applyChargeData, loadChargeStatus, parcelId],
  );

  const initPayPage = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/payment/charges?parcelId=${encodeURIComponent(parcelId)}`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as
        | {
            ok: true;
            data:
              | { alreadyPaid: true; parcelId: string; trackingId: string | null; barcode: string | null }
              | { bulkPayAll: true; paymentId: string }
              | { needsCharge: true }
              | ChargeData;
          }
        | { ok: false; error: string };
      if (!res.ok || !("ok" in json) || !json.ok) {
        setError(("error" in json && json.error) || "โหลดหน้าชำระเงินไม่สำเร็จ");
        return;
      }
      const data = json.data;
      if ("alreadyPaid" in data && data.alreadyPaid) {
        const qp = new URLSearchParams({
          parcelId: data.parcelId,
          trackingId: data.trackingId ?? "",
          from: "payment",
        });
        router.replace(`/send/success?${qp.toString()}`);
        return;
      }
      if ("bulkPayAll" in data && data.bulkPayAll) {
        router.replace("/pay/all");
        return;
      }
      if ("needsCharge" in data && data.needsCharge) {
        await createCharge();
        return;
      }
      if ("paymentId" in data && "status" in data) {
        await applyChargeData(data);
      }
    } catch {
      setError("เครือข่ายผิดพลาด กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  }, [applyChargeData, createCharge, parcelId, router]);

  useEffect(() => {
    if (initOnceRef.current) return;
    initOnceRef.current = true;
    void initPayPage();
  }, [initPayPage]);

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
            await applyChargeData(json.data);
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
  }, [charge, applyChargeData]);

  // On success → brief confirmation then payment success summary page.
  useEffect(() => {
    if (charge?.status !== "succeeded") return;
    const t = setTimeout(() => {
      router.replace(buildPaymentSuccessUrl(charge));
    }, PAY_SUCCESS_REDIRECT_MS);
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
        await applyChargeData(statusData);
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
    [applyChargeData, charge, loadChargeStatus, openBankApp, parcelId, switching],
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
  const activeBankMethod =
    charge && !isPromptPayCharge(charge)
      ? BANK_PAYMENT_METHODS.find((m) => m.id === charge.paymentMethod)
      : null;

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

                {isPromptPayCharge(charge) ? (
                  <>
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
                    <PromptPaySaveQrButton paymentId={charge.paymentId} />
                    <p className="text-sm text-slate-600">
                      สแกน QR แล้วชำระในแอปธนาคาร · เหลือเวลา{" "}
                      <span className="font-semibold text-slate-900">{mm}:{ss}</span>
                    </p>
                    {charge.qrPayload && !charge.qrPayload.startsWith("data:image/") ? (
                      <p className="break-all text-center text-[10px] text-slate-400 select-all">
                        {charge.qrPayload}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <div className="w-full max-w-sm rounded-xl border border-indigo-100 bg-indigo-50/80 px-5 py-5 text-center">
                    {activeBankMethod ? (
                      <Image
                        src={activeBankMethod.logoSrc}
                        alt=""
                        width={72}
                        height={72}
                        className="mx-auto h-[4.5rem] w-[4.5rem] rounded-xl object-contain"
                      />
                    ) : null}
                    <p className="mt-3 text-base font-semibold text-slate-900">
                      ชำระผ่าน {methodLabelTh(charge.paymentMethod)}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                      เปิดแอปธนาคารและทำรายการชำระเงินให้เสร็จ
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-slate-500">
                      เมื่อชำระเสร็จในแอปธนาคารแล้ว กด{" "}
                      <span className="font-medium">Return to merchant</span> หรือกลับมาหน้านี้
                      แล้วรอสักครู่ ระบบจะอัปเดตสถานะอัตโนมัติ (โดยทั่วไปไม่เกิน 1 นาที){" "}
                      <span className="font-medium text-slate-600">ไม่ต้องชำระซ้ำ</span>
                    </p>
                    {charge.redirectUrl ? (
                      <button
                        type="button"
                        onClick={() => openBankApp(charge.redirectUrl!)}
                        className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-[#2726F5] px-4 py-3 text-sm font-semibold text-white shadow-sm"
                      >
                        เปิดแอป {methodLabelTh(charge.paymentMethod)}
                      </button>
                    ) : null}
                    <p className="mt-3 text-sm text-slate-600">
                      เหลือเวลา <span className="font-semibold text-slate-900">{mm}:{ss}</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => void switchToPromptPay()}
                      disabled={loading || switching !== null}
                      className="mt-3 text-sm font-medium text-[#2726F5] underline disabled:opacity-50"
                    >
                      เปลี่ยนไปชำระด้วยพร้อมเพย์
                    </button>
                  </div>
                )}

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
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                  <CheckCircleIcon className="h-9 w-9 text-emerald-600" />
                </div>
                <p className="text-xl font-semibold text-emerald-700">ชำระเงินสำเร็จ</p>
                <p className="text-sm text-slate-600">
                  ยอดชำระ ฿ {formattedAmount} บาท
                </p>
                {charge.barcode || charge.trackingId ? (
                  <p className="text-xs text-slate-500">
                    หมายเลขพัสดุ: {charge.barcode || charge.trackingId}
                  </p>
                ) : null}
                <p className="mt-1 text-sm text-slate-500">กำลังพาไปหน้าสรุป...</p>
              </div>
            ) : charge?.status === "expired" ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
                  <XCircleIcon className="h-8 w-8 text-amber-700" />
                </div>
                <p className="text-lg font-semibold text-slate-900">รหัสชำระเงินหมดอายุ</p>
                <p className="max-w-xs text-sm leading-relaxed text-slate-600">
                  ยังไม่มีการหักเงิน กรุณาสร้างรหัสชำระเงินใหม่เพื่อดำเนินการต่อ
                </p>
                <button
                  type="button"
                  onClick={() => createCharge()}
                  disabled={loading}
                  className="mt-2 inline-flex items-center gap-2 rounded-full bg-[#2726F5] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {loading && (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  )}
                  ลองชำระอีกครั้ง
                </button>
                <button
                  type="button"
                  onClick={() => router.push(`/parcels/${encodeURIComponent(parcelId)}`)}
                  className="text-sm font-medium text-[#2726F5] underline"
                >
                  ดูรายละเอียดพัสดุ
                </button>
              </div>
            ) : charge?.status === "failed" ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-100">
                  <XCircleIcon className="h-8 w-8 text-rose-600" />
                </div>
                <p className="text-lg font-semibold text-rose-700">การชำระเงินไม่สำเร็จ</p>
                <p className="max-w-xs text-sm leading-relaxed text-slate-600">
                  ยังไม่มีการหักเงิน คุณสามารถลองชำระใหม่ด้วยพร้อมเพย์หรือแอปธนาคารอื่น
                </p>
                <button
                  type="button"
                  onClick={() => createCharge()}
                  disabled={loading}
                  className="mt-2 inline-flex items-center gap-2 rounded-full bg-[#2726F5] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {loading && (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  )}
                  ลองชำระอีกครั้ง
                </button>
                <button
                  type="button"
                  onClick={() => router.push(`/parcels/${encodeURIComponent(parcelId)}`)}
                  className="text-sm font-medium text-[#2726F5] underline"
                >
                  ดูรายละเอียดพัสดุ
                </button>
              </div>
            ) : charge?.status === "canceled" ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                  <XCircleIcon className="h-8 w-8 text-slate-500" />
                </div>
                <p className="text-lg font-semibold text-slate-800">ยกเลิกการชำระเงิน</p>
                <p className="max-w-xs text-sm leading-relaxed text-slate-600">
                  หากต้องการชำระค่าฝากส่ง สามารถกลับมาชำระใหม่ได้
                </p>
                <button
                  type="button"
                  onClick={() => createCharge()}
                  disabled={loading}
                  className="mt-2 inline-flex items-center gap-2 rounded-full bg-[#2726F5] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {loading && (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  )}
                  ชำระอีกครั้ง
                </button>
                <button
                  type="button"
                  onClick={() => router.push(`/parcels/${encodeURIComponent(parcelId)}`)}
                  className="text-sm font-medium text-[#2726F5] underline"
                >
                  ดูรายละเอียดพัสดุ
                </button>
              </div>
            ) : null}
          </div>

          {charge?.status === "pending" && isPromptPayCharge(charge) ? (
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
                      aria-label={m.labelTh}
                      className={`flex flex-col items-center justify-center rounded-md border px-3 py-3 transition disabled:opacity-50 ${
                        selected
                          ? "border-[#2726F5] bg-indigo-50 ring-1 ring-[#2726F5]/20"
                          : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100"
                      }`}
                    >
                      <Image
                        src={m.logoSrc}
                        alt=""
                        width={56}
                        height={56}
                        className="h-14 w-14 rounded-lg object-contain"
                      />
                      {switching === m.id ? (
                        <span className="mt-2 text-[11px] text-[#2726F5]">กำลังเปิดแอป...</span>
                      ) : selected ? (
                        <span className="mt-2 text-[11px] font-medium text-[#2726F5]">
                          กำลังใช้งาน
                        </span>
                      ) : (
                        <span className="mt-2 text-center text-xs font-medium text-slate-700">
                          {m.labelTh}
                        </span>
                      )}
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
