import QRCode from "qrcode";
import sharp from "sharp";
import { readFile } from "fs/promises";
import path from "path";
import { eq } from "drizzle-orm";
import { getDb, payments } from "@quickload/shared/db";
import { NextResponse } from "next/server";

const CARD_WIDTH = 600;
const HEADER_H = 80;
const PP_LOGO_PAD = 20;
const PP_LOGO_H = 60;
const QR_SIZE = 400;
const PAD_BOTTOM = 20; // HEADER_H(80) + PP_LOGO_H(60) + PP_LOGO_PAD*2(40) + QR_SIZE(400) + PAD_BOTTOM(20) = 600

function decodeDataImageToPngBuffer(dataUrl: string): Buffer | null {
  const m = /^data:image\/png;base64,(.+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  try {
    return Buffer.from(m[1], "base64");
  } catch {
    return null;
  }
}

async function renderQrPngBuffer(qrPayload: string): Promise<Buffer> {
  const payload = qrPayload.trim();
  if (payload.startsWith("data:image/")) {
    const decoded = decodeDataImageToPngBuffer(payload);
    if (!decoded) throw new Error("unsupported_qr_image");
    return decoded;
  }
  return QRCode.toBuffer(payload, { type: "png", width: 1024, margin: 1 });
}

/** Branded card for LINE Flex (matches /pay page: Thai QR header, PromptPay, QR + center logo). */
async function buildBrandedPromptPayQrCard(qrPng: Buffer): Promise<Buffer> {
  const publicDir = path.join(process.cwd(), "public");
  const [thaiLogoPng, ppLogo, centerLogo] = await Promise.all([
    readFile(path.join(publicDir, "Thai_QR_Logo.png")),
    readFile(path.join(publicDir, "PromptPay-logo.png")),
    readFile(path.join(publicDir, "promp-pay-logo-square.png")),
  ]);

  const thaiLogo = await sharp(thaiLogoPng).resize({ height: 52, fit: "inside" }).png().toBuffer();
  const thaiMeta = await sharp(thaiLogo).metadata();

  const ppResized = await sharp(ppLogo).resize({ height: PP_LOGO_H, fit: "inside" }).png().toBuffer();
  const ppMeta = await sharp(ppResized).metadata();

  const centerResized = await sharp(centerLogo).resize({ width: 44, height: 44 }).png().toBuffer();

  const qrResized = await sharp(qrPng).resize(QR_SIZE, QR_SIZE, { fit: "contain", background: "#ffffff" }).png().toBuffer();
  const qrWithCenter = await sharp(qrResized)
    .composite([{ input: centerResized, gravity: "center" }])
    .png()
    .toBuffer();

  const blueHeader = await sharp({
    create: {
      width: CARD_WIDTH,
      height: HEADER_H,
      channels: 4,
      background: { r: 18, g: 62, b: 111, alpha: 255 },
    },
  })
    .png()
    .toBuffer();

  const thaiW = thaiMeta.width ?? 126;
  const thaiLeft = Math.max(0, Math.round((CARD_WIDTH - thaiW) / 2));
  const ppW = ppMeta.width ?? 200;
  const ppTop = HEADER_H + PP_LOGO_PAD;
  const ppLeft = Math.max(0, Math.round((CARD_WIDTH - ppW) / 2));
  const ppAreaH = PP_LOGO_H + PP_LOGO_PAD * 2;
  const qrTop = HEADER_H + ppAreaH;
  const qrLeft = Math.max(0, Math.round((CARD_WIDTH - QR_SIZE) / 2));
  const totalH = HEADER_H + ppAreaH + QR_SIZE + PAD_BOTTOM;

  return sharp({
    create: {
      width: CARD_WIDTH,
      height: totalH,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 255 },
    },
  })
    .composite([
      { input: blueHeader, top: 0, left: 0 },
      { input: thaiLogo, top: Math.round((HEADER_H - 52) / 2), left: thaiLeft },
      { input: ppResized, top: ppTop, left: ppLeft },
      { input: qrWithCenter, top: qrTop, left: qrLeft },
    ])
    .png()
    .toBuffer();
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const paymentId = params.id?.trim();
    if (!paymentId) {
      return new NextResponse("payment id required", { status: 400 });
    }

    const db = getDb();
    const [payment] = await db
      .select({ qrPayload: payments.qrPayload })
      .from(payments)
      .where(eq(payments.id, paymentId))
      .limit(1);
    if (!payment?.qrPayload) {
      return new NextResponse("QR not found", { status: 404 });
    }

    const qrPng = await renderQrPngBuffer(payment.qrPayload);
    const branded = await buildBrandedPromptPayQrCard(qrPng);

    return new NextResponse(new Uint8Array(branded), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return new NextResponse(msg, { status: 500 });
  }
}
