"use client";

import { navigateAfterAuth } from "@/lib/navigate-after-auth";
import {
  clearPendingProfile,
  maskThaiPhone,
  readPendingProfile,
} from "@/lib/pending-profile";
import { isValidThaiPhone, normalizeThaiPhone } from "@/lib/thai-phone";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { PendingProfile } from "@/lib/pending-profile";

const TITLE_FONT_CLASS = "font-title-placeholder";
const OTP_LENGTH = 6;
const RESEND_SECONDS = 60;

function VerifyPhoneInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const phoneParam = searchParams.get("phone") ?? "";
  const normalizedPhone = normalizeThaiPhone(phoneParam);

  const [digits, setDigits] = useState<string[]>(() => Array.from({ length: OTP_LENGTH }, () => ""));
  const [codeSent, setCodeSent] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pendingProfile, setPendingProfile] = useState<PendingProfile | null>(null);
  const [loadedPending, setLoadedPending] = useState(false);

  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const autoSendAttemptedRef = useRef(false);

  const otpCode = digits.join("");
  const otpComplete = digits.every((digit) => digit.length === 1);
  const phoneValid = isValidThaiPhone(normalizedPhone);
  const phoneMatchesPending = pendingProfile?.phone === normalizedPhone;
  const canSubmit =
    otpComplete && codeSent && phoneValid && phoneMatchesPending && Boolean(pendingProfile) && !verifying;

  useEffect(() => {
    setPendingProfile(readPendingProfile());
    setLoadedPending(true);
  }, []);

  useEffect(() => {
    if (!loadedPending) return;
    if (!phoneValid) {
      setMsg("ไม่พบเบอร์โทรที่ถูกต้อง กรุณากลับไปกรอกข้อมูลอีกครั้ง");
      return;
    }
    if (!phoneMatchesPending) {
      setMsg("ไม่พบข้อมูลที่รอการยืนยัน กรุณากลับไปกรอกข้อมูลสมาชิกอีกครั้ง");
    }
  }, [loadedPending, phoneValid, phoneMatchesPending]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const focusInput = useCallback((index: number) => {
    const el = inputRefs.current[index];
    if (!el) return;
    el.focus();
    // On Android, the soft keyboard pushes the viewport up but the focused element
    // can still be partially hidden under the keyboard. scrollIntoView with
    // block:"center" ensures the input is always visible after focus.
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  const handleSendCode = useCallback(async () => {
    if (!phoneValid || !phoneMatchesPending || sending || resendIn > 0) return;

    setSending(true);
    setSendError(null);
    setMsg(null);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch("/api/auth/otp/request", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalizedPhone }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        if (res.status === 429) {
          setResendIn(RESEND_SECONDS);
        }
        setSendError(json.error ?? "ส่งรหัส OTP ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
        return;
      }
      setCodeSent(true);
      setResendIn(RESEND_SECONDS);
      focusInput(0);
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof Error && e.name === "AbortError") {
        setSendError("ส่งรหัส OTP ช้าเกินไป กรุณาลองใหม่อีกครั้ง");
      } else {
        setSendError("ส่งรหัส OTP ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      }
    } finally {
      setSending(false);
    }
  }, [focusInput, normalizedPhone, phoneMatchesPending, phoneValid, resendIn, sending]);

  useEffect(() => {
    if (!loadedPending || autoSendAttemptedRef.current) return;
    if (!phoneValid || !phoneMatchesPending) return;
    autoSendAttemptedRef.current = true;
    void handleSendCode();
  }, [handleSendCode, loadedPending, phoneMatchesPending, phoneValid]);

  function handleDigitChange(index: number, value: string) {
    const nextChar = value.replace(/\D/g, "").slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = nextChar;
      return next;
    });
    if (nextChar && index < OTP_LENGTH - 1) {
      focusInput(index + 1);
    }
  }

  function handleDigitKeyDown(index: number, key: string) {
    if (key === "Backspace" && !digits[index] && index > 0) {
      focusInput(index - 1);
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;
    const next = Array.from({ length: OTP_LENGTH }, (_, i) => pasted[i] ?? "");
    setDigits(next);
    if (pasted.length < OTP_LENGTH) {
      focusInput(Math.min(pasted.length, OTP_LENGTH - 1));
    }
  }

  const failedOtpCodeRef = useRef<string | null>(null);
  const verifyInFlightRef = useRef(false);
  const verifyCompletedRef = useRef(false);

  const submitVerify = useCallback(async (): Promise<boolean> => {
    if (verifyCompletedRef.current || verifyInFlightRef.current) return false;
    setMsg(null);

    if (!phoneValid || !phoneMatchesPending || !pendingProfile) {
      setMsg("ไม่สามารถยืนยันเบอร์โทรได้ กรุณากลับไปกรอกข้อมูลอีกครั้ง");
      return false;
    }
    if (!codeSent) {
      setMsg("กรุณารอระบบส่งรหัส OTP");
      return false;
    }
    if (!otpComplete) {
      setMsg("กรุณากรอกรหัส OTP ให้ครบ 6 หลัก");
      return false;
    }

    verifyInFlightRef.current = true;
    setVerifying(true);
    try {
      const verifyRes = await fetch("/api/auth/otp/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalizedPhone, pin: otpCode }),
      });
      const verifyJson = (await verifyRes.json()) as { ok?: boolean; error?: string };
      if (!verifyRes.ok || !verifyJson.ok) {
        setMsg(verifyJson.error ?? "รหัส OTP ไม่ถูกต้อง");
        return false;
      }

      const res = await fetch("/api/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendingProfile),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setMsg(json.error ?? "บันทึกข้อมูลสมาชิกไม่สำเร็จ");
        return false;
      }

      verifyCompletedRef.current = true;
      clearPendingProfile();
      setMsg("ยืนยันเบอร์โทรสำเร็จ กำลังพาไปหน้าหลัก…");
      setTimeout(() => {
        navigateAfterAuth(router, "/", { hard: true });
      }, 700);
      return true;
    } catch {
      setMsg("ยืนยันรหัส OTP ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      return false;
    } finally {
      verifyInFlightRef.current = false;
      setVerifying(false);
    }
  }, [
    codeSent,
    normalizedPhone,
    otpCode,
    otpComplete,
    pendingProfile,
    phoneMatchesPending,
    phoneValid,
    router,
  ]);

  useEffect(() => {
    if (!canSubmit || verifyCompletedRef.current || failedOtpCodeRef.current === otpCode) return;
    void submitVerify().then((ok) => {
      if (!ok && !verifyCompletedRef.current) {
        failedOtpCodeRef.current = otpCode;
      }
    });
  }, [canSubmit, otpCode, submitVerify]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    failedOtpCodeRef.current = null;
    const ok = await submitVerify();
    if (!ok) {
      failedOtpCodeRef.current = otpCode;
    }
  }

  const canResend = phoneValid && phoneMatchesPending && !sending && resendIn <= 0;

  return (
    <main className="min-h-screen bg-slate-100">
      <section className="bg-[#2726F5] px-6 pb-20 pt-12 text-white">
        <div className="mx-auto w-full max-w-lg">
          <h1 className={`${TITLE_FONT_CLASS} text-4xl font-bold leading-tight`}>ยืนยันเบอร์โทร</h1>
          <p className="mt-2 text-lg text-white/80">
            {phoneValid
              ? `กรอกรหัส OTP ที่ส่งไปที่ ${maskThaiPhone(normalizedPhone)}`
              : "กรอกรหัส OTP เพื่อยืนยันเบอร์โทรของคุณ"}
          </p>
        </div>
      </section>

      <section className="-mt-12 px-6 pb-10">
        <div className="mx-auto w-full max-w-lg rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200">
          {loadedPending ? null : <p className="mb-4 text-sm text-slate-600">กำลังโหลด…</p>}

          <form onSubmit={(e) => void handleVerify(e)} className="space-y-4">
            {codeSent ? (
              <div className="flex items-center gap-2 text-sm text-emerald-700">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  fill="currentColor"
                  className="shrink-0"
                  viewBox="0 0 16 16"
                  aria-hidden
                >
                  <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16" />
                  <path d="m10.97 4.97-.02.022-3.473 4.425-2.093-2.094a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-1.071-1.05" />
                </svg>
                <span>ส่งรหัส OTP แล้ว กรุณาตรวจสอบ SMS</span>
              </div>
            ) : null}

            {sendError ? <p className="text-sm text-red-600">{sendError}</p> : null}

            <div>
              <p className="mb-2 text-sm font-medium text-slate-800">รหัส OTP</p>
              <div className="flex gap-3">
                {digits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => {
                      inputRefs.current[index] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    autoComplete={index === 0 ? "one-time-code" : "off"}
                    maxLength={1}
                    value={digit}
                    disabled={verifying}
                    onChange={(e) => handleDigitChange(index, e.target.value)}
                    onKeyDown={(e) => handleDigitKeyDown(index, e.key)}
                    onPaste={handlePaste}
                    className={`aspect-square min-w-0 flex-1 rounded-lg border text-center text-2xl font-semibold outline-none transition focus:border-[#2726F5] disabled:bg-slate-50 disabled:opacity-60 ${
                      verifying ? "border-[#2726F5]/40" : "border-slate-300"
                    }`}
                    aria-label={`หลักที่ ${index + 1}`}
                  />
                ))}
              </div>

              <div className="mt-3 text-right">
                {sending ? (
                  <span className="text-xs text-slate-500">กำลังส่งรหัส…</span>
                ) : resendIn > 0 ? (
                  <span className="text-xs text-slate-500">ส่งอีกครั้งได้ใน {resendIn} วินาที</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleSendCode()}
                    disabled={!canResend}
                    className="inline-flex items-center gap-1 text-xs text-[#2726F5] underline underline-offset-2 disabled:opacity-50"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      fill="currentColor"
                      viewBox="0 0 16 16"
                      aria-hidden
                    >
                      <path
                        fillRule="evenodd"
                        d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2z"
                      />
                      <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466" />
                    </svg>
                    ส่งรหัส OTP อีกครั้ง
                  </button>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => router.replace("/register")}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                กลับ
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#2726F5] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {verifying ? (
                  <>
                    <span
                      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"
                      aria-hidden
                    />
                    กำลังยืนยัน…
                  </>
                ) : (
                  "ยืนยัน"
                )}
              </button>
            </div>
          </form>

          {msg ? (
            <p className={`mt-4 text-sm ${msg.includes("สำเร็จ") ? "text-emerald-700" : "text-red-600"}`}>
              {msg}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}

export default function VerifyPhonePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-100">
          <p className="text-sm text-slate-600">กำลังโหลด…</p>
        </main>
      }
    >
      <VerifyPhoneInner />
    </Suspense>
  );
}
