"use client";

import { savePromptPayQrImage } from "@/lib/save-promptpay-qr-image";
import { useState } from "react";

export function PromptPaySaveQrButton({ paymentId }: { paymentId: string }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError(null);
    const result = await savePromptPayQrImage(paymentId);
    setSaving(false);
    if (!result.ok) setError(result.error);
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-white hover:text-slate-800 active:scale-[0.97] disabled:opacity-40"
      >
        {saving ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" aria-hidden className="shrink-0 text-slate-500">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        {saving ? "กำลังบันทึก…" : "บันทึก QR ลงรูปภาพ"}
      </button>
      {error ? <p className="text-center text-[11px] text-red-500">{error}</p> : null}
    </div>
  );
}
