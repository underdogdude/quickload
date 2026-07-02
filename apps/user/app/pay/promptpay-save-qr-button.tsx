"use client";

import { savePromptPayQrImage } from "@/lib/save-promptpay-qr-image";
import { useEffect, useState } from "react";

function successMessage(method: "share" | "download" | "open"): string {
  if (method === "open") return "เปิดรูปแล้ว — กดค้างที่รูปเพื่อบันทึก";
  return "บันทึกลงรูปภาพแล้ว";
}

export function PromptPaySaveQrButton({ paymentId }: { paymentId: string }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!savedMessage) return;
    const timer = window.setTimeout(() => setSavedMessage(null), 3500);
    return () => window.clearTimeout(timer);
  }, [savedMessage]);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError(null);
    setSavedMessage(null);
    const result = await savePromptPayQrImage(paymentId);
    setSaving(false);
    if (result.ok) {
      setSavedMessage(successMessage(result.method));
      return;
    }
    if (!result.cancelled && result.error) setError(result.error);
  }

  const saved = savedMessage !== null;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-medium shadow-sm transition active:scale-[0.97] disabled:opacity-40 ${
          saved
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white hover:text-slate-800"
        }`}
      >
        {saving ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
        ) : saved ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" aria-hidden className="shrink-0 text-emerald-600">
            <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" aria-hidden className="shrink-0 text-slate-500">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        {saving ? "กำลังบันทึก…" : saved ? "บันทึกแล้ว" : "บันทึก QR ลงรูปภาพ"}
      </button>
      {savedMessage ? <p className="text-center text-[11px] font-medium text-emerald-600">{savedMessage}</p> : null}
      {error ? <p className="text-center text-[11px] text-red-500">{error}</p> : null}
    </div>
  );
}
