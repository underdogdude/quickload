import generatePayload from "promptpay-qr";
import QRCode from "qrcode";

/**
 * Builds a Thai PromptPay EMV payload and returns a PNG data URL for <img src="…" />.
 * `promptPayId`: phone (10 digits), tax ID, etc. — same rules as `promptpay-qr`.
 */
export async function promptPayPayloadToDataUrl(
  promptPayId: string,
  amountBaht?: number,
): Promise<string> {
  const id = promptPayId.trim();
  if (!id) throw new Error("missing_promptpay_id");
  const opts =
    amountBaht !== undefined && Number.isFinite(amountBaht) && amountBaht > 0
      ? { amount: amountBaht }
      : {};
  const payload = generatePayload(id, opts);
  return QRCode.toDataURL(payload, {
    width: 240,
    margin: 2,
    errorCorrectionLevel: "M",
  });
}
