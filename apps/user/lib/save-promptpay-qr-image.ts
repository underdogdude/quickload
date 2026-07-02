export type SavePromptPayQrResult =
  | { ok: true; method: "share" | "download" | "open" }
  | { ok: false; error: string; cancelled?: boolean };

function defaultFilename(paymentId: string): string {
  return `promptpay-qr-${paymentId.slice(0, 8)}.png`;
}

/** Revoke an object URL safely after a short delay so mobile browsers have
 *  time to start the download / render the blob before the URL is invalidated. */
function revokeAfterDelay(objectUrl: string, ms = 2000) {
  setTimeout(() => URL.revokeObjectURL(objectUrl), ms);
}

/** Returns true when running inside the LINE in-app browser on Android. */
function isAndroidLineWebView(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Android/i.test(ua) && /Line\//i.test(ua);
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

    // ── Strategy 1: Web Share API (iOS & Android Chrome 75+) ─────────────────
    // Gives the native share sheet where the user can pick "Save Image" /
    // "บันทึกลงรูปภาพ". On Android LINE WebView this is the most reliable path.
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: "PromptPay QR" });
          return { ok: true, method: "share" };
        }
      } catch (e) {
        // User dismissed share sheet — not an error, but not a save either.
        if (e instanceof Error && e.name === "AbortError") {
          return { ok: false, error: "", cancelled: true };
        }
        // Other share error: fall through to next strategy.
      }
    }

    const objectUrl = URL.createObjectURL(blob);

    // ── Strategy 2: Android LINE WebView — window.open ────────────────────────
    // anchor[download] is often silently ignored in Android LINE WebView; opening
    // the blob URL instead lets the user long-press the image and tap "Save".
    if (isAndroidLineWebView()) {
      window.open(objectUrl, "_blank");
      revokeAfterDelay(objectUrl, 5000);
      return { ok: true, method: "open" };
    }

    // ── Strategy 3: Standard anchor[download] (desktop + non-LINE Android) ───
    // IMPORTANT: revoke AFTER a delay — calling revokeObjectURL synchronously
    // right after anchor.click() means mobile browsers can't start the download
    // before the URL is invalidated.
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    revokeAfterDelay(objectUrl, 2000);
    return { ok: true, method: "download" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "เกิดข้อผิดพลาด";
    return { ok: false, error: msg };
  }
}
