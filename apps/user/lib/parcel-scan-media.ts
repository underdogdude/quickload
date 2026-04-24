import JsBarcode from "jsbarcode";
import QRCode from "qrcode";

export async function parcelQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    margin: 1,
    width: 220,
    color: { dark: "#0f172a", light: "#ffffff" },
  });
}

/** Linear barcode (CODE128); decodes to the same string as `text`. */
export function parcelBarcodeDataUrl(text: string): string {
  const canvas = document.createElement("canvas");
  JsBarcode(canvas, text, {
    format: "CODE128",
    width: 2,
    height: 72,
    displayValue: true,
    fontSize: 13,
    textMargin: 4,
    margin: 10,
  });
  return canvas.toDataURL("image/png");
}
