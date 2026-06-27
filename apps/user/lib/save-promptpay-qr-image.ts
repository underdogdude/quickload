export type SavePromptPayQrResult =
  | { ok: true; method: "share" | "download" | "open" }
  | { ok: false; error: string };

function defaultFilename(paymentId: string): string {
  return `promptpay-qr-${paymentId.slice(0, 8)}.png`;
}

/** Save branded PromptPay QR (from /api/payment/charges/[id]/qr.png) to Photos / downloads. */
export async function savePromptPayQrImage(paymentId: string): Promise<SavePromptPayQrResult> {
  const id = paymentId.trim();
  if (!id) return { ok: false, error: "ไม่พบรหัสการชำระเงิน" };

  try {
    const res = await fetch(`/api/payment/charges/${encodeURIComponent(id)}/qr.png`, { cache: "no-store" });
    if (!res.ok) {
      return { ok: false, error: "ไม่สามารถโหลดรูป QR ได้ กรุณาลองใหม่อีกครั้ง" };
    }

    const blob = await res.blob();
    const filename = defaultFilename(id);
    const file = new File([blob], filename, { type: "image/png" });

    // iOS / Android: share sheet → "Save Image" / "บันทึกลงรูปภาพ"
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: "PromptPay QR" });
          return { ok: true, method: "share" };
        }
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          return { ok: true, method: "share" };
        }
      }
    }

    // Desktop / browsers with download support
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    return { ok: true, method: "download" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "เกิดข้อผิดพลาด";
    return { ok: false, error: msg };
  }
}
