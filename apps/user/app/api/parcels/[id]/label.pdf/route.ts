import { getDb, orders, parcels } from "@quickload/shared/db";
import { resolveInsuranceFee } from "@quickload/shared/parcel-price-breakdown";
import bwipjs from "bwip-js/node";
import { and, eq } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, degrees } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { NextResponse } from "next/server";
import { requireLineSession } from "@/lib/require-user";
import { verifyFlexToken } from "@/lib/flex-token";

export const runtime = "nodejs";

// ─── units ────────────────────────────────────────────────────────────────────
const PT_PER_MM = 72 / 25.4;
/** ISO A6 landscape (148 × 105 mm). Layout coords below are scaled from the original 102 × 76 mm design. */
const W_MM = 148;
const H_MM = 105;
const DESIGN_W_MM = 102;
const DESIGN_H_MM = 76;
const LAYOUT_SX = W_MM / DESIGN_W_MM;
const LAYOUT_SY = H_MM / DESIGN_H_MM;
const PW = W_MM * PT_PER_MM; // page width  in pt
const PH = H_MM * PT_PER_MM; // page height in pt
const mm = (v: number) => v * PT_PER_MM;

// pdf-lib origin is bottom-left; design coords are top-left on the original 102×76 mm artboard
const y = (topMm: number) => PH - mm(topMm * LAYOUT_SY);
const xPos = (leftMm: number) => mm(leftMm * LAYOUT_SX);
const wScale = (widthMm: number) => mm(widthMm * LAYOUT_SX);
const hScale = (heightMm: number) => mm(heightMm * LAYOUT_SY);
/** Scale design-time point sizes to match the enlarged A6 artboard. */
const FONT_SCALE = (LAYOUT_SX + LAYOUT_SY) / 2;
const fontPt = (designPt: number) => designPt * FONT_SCALE;

// ─── helpers ──────────────────────────────────────────────────────────────────
function compact(parts: Array<string | null | undefined>) {
  return parts
    .map((p) => p?.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
}

function compactAddress(parts: Array<string | null | undefined>) {
  const segments: string[] = [];
  for (const raw of parts) {
    if (!raw) continue;
    const cleaned = raw.replace(/\s+/g, " ").trim().replace(/[,]+/g, ",");
    for (const piece of cleaned.split(",")) {
      const t = piece.trim();
      if (t && segments[segments.length - 1] !== t) segments.push(t);
    }
  }
  return segments.join(", ");
}

function zipDigits(zip: string) {
  const d = zip.replace(/\D/g, "").slice(0, 5);
  return Array.from({ length: 5 }, (_, i) => d[i] ?? "");
}

function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (lines.length >= maxLines) break;
    const candidate = cur ? `${cur} ${w}` : w;
    if (candidate.length <= maxChars) {
      cur = candidate;
    } else {
      if (cur) lines.push(cur);
      // Never slice Thai words mid-grapheme — tone marks must stay with base consonants.
      cur = w;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines.length ? lines : [text];
}

function drawCenteredText(
  page: ReturnType<PDFDocument["addPage"]>,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  text: string,
  centerXMm: number,
  topMm: number,
  sizePt: number,
  color: ReturnType<typeof rgb>,
) {
  const tw = font.widthOfTextAtSize(text, sizePt);
  page.drawText(text, { x: xPos(centerXMm) - tw / 2, y: y(topMm), size: sizePt, font, color });
}

function drawCenteredLines(
  page: ReturnType<PDFDocument["addPage"]>,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  lines: string[],
  centerXMm: number,
  topMm: number,
  sizePt: number,
  lineGapMm: number,
  color: ReturnType<typeof rgb>,
) {
  lines.forEach((line, i) => {
    drawCenteredText(page, font, line, centerXMm, topMm + i * lineGapMm, sizePt, color);
  });
}


function resolvePublic(rel: string) {
  const norm = rel.replace(/^\/+/, "");
  const cwd = process.cwd();
  for (const base of [path.join(cwd, "public"), path.join(cwd, "apps", "user", "public")]) {
    const fp = path.join(base, norm);
    try { require("node:fs").accessSync(fp); return fp; } catch { /* try next */ }
  }
  return path.join(cwd, "public", norm);
}

async function readPublic(rel: string) {
  return readFile(resolvePublic(rel));
}

async function barcodePng(text: string, opts?: { scale?: number; height?: number }) {
  return bwipjs.toBuffer({
    bcid: "code128",
    text,
    scale: opts?.scale ?? 3,
    height: opts?.height ?? 12,
    includetext: false,
    paddingwidth: 0,
    paddingheight: 0,
  });
}

function formatPrintedAt() {
  return new Date().toLocaleString("th-TH", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

function formatProductInsuranceLabel(
  productPrice: string | null | undefined,
  insuranceRatePrice: string | null | undefined,
): string {
  if (resolveInsuranceFee(productPrice, insuranceRatePrice) > 0) {
    return "<< มีประกันราคาสินค้า >>";
  }
  return "-";
}

// ─── main label builder ───────────────────────────────────────────────────────
async function createParcelLabelPdf(input: {
  trackingNumber: string;
  senderName: string;
  senderAddress: string;
  senderPhone: string;
  recipientName: string;
  recipientAddress: string;
  recipientPhone: string;
  recipientZipcode: string;
  weight: string;
  items: string;
  productInsuranceLabel: string;
}) {
  const [regularBuf, boldBuf, logoBuf, barcodeTopBuf, barcodeFootBuf] = await Promise.all([
    readPublic("fonts/Sarabun/Sarabun-Regular.ttf"),
    readPublic("fonts/Sarabun/Sarabun-Bold.ttf"),
    readPublic("quickload-logo.png"),
    barcodePng(input.trackingNumber, { scale: 3, height: 11 }),
    barcodePng(input.trackingNumber, { scale: 2, height: 6 }),
  ]);

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  const [regular, bold] = await Promise.all([
    doc.embedFont(regularBuf),
    doc.embedFont(boldBuf),
  ]);

  const [logoImg, barcodeTopImg, barcodeFootImg] = await Promise.all([
    doc.embedPng(logoBuf),
    doc.embedPng(barcodeTopBuf),
    doc.embedPng(barcodeFootBuf),
  ]);

  const page = doc.addPage([PW, PH]);
  const BK = rgb(0.07, 0.07, 0.07);
  const WHITE = rgb(1, 1, 1);

  const line = (x1: number, y1: number, x2: number, y2: number, thickness = 0.8) =>
    page.drawLine({ start: { x: xPos(x1), y: y(y1) }, end: { x: xPos(x2), y: y(y2) }, thickness, color: BK });

  const rect = (xMm: number, yMm: number, wMm: number, hMm: number, thickness = 0.8) =>
    page.drawRectangle({
      x: xPos(xMm),
      y: y(yMm) - hScale(hMm),
      width: wScale(wMm),
      height: hScale(hMm),
      borderColor: BK,
      borderWidth: thickness,
      color: WHITE,
    });

  // Draw text — top-left baseline aligned
  const txt = (
    str: string,
    xMm: number,
    yMm: number,
    sizePt: number,
    opts?: { bold?: boolean; center?: boolean; centerWidthMm?: number },
  ) => {
    const font = opts?.bold ? bold : regular;
    let drawX = xPos(xMm);
    if (opts?.center && opts.centerWidthMm != null) {
      const textW = font.widthOfTextAtSize(str, sizePt);
      drawX = xPos(xMm) + (wScale(opts.centerWidthMm) - textW) / 2;
    }
    page.drawText(str, { x: drawX, y: y(yMm), size: sizePt, font, color: BK });
  };

  // ── outer border ─────────────────────────────────────────────────
  rect(0.8, 0.8, 100.4, 74.4, 1.5);

  // ── logo (natural ratio 3.66:1 → fix height to 12mm, width = 12*3.66 = 43.9mm) ─
  const logoH = 12;
  const logoW = logoH * (644 / 176); // ~43.9mm keeps aspect ratio
  const logoTopMm = (21 - logoH) / 2; // vertically centre in 21mm band
  page.drawImage(logoImg, { x: xPos(1.8), y: y(logoTopMm + logoH), width: wScale(logoW), height: hScale(logoH) });

  // ── top barcode (starts after logo, fits within page width) ──────
  const barcodeX = 47;          // start after logo (~1.8+43.9+1.5 gap)
  const barcodeY = 2.5;
  const barcodeW = 52;          // 47+52=99mm — fits within border on original artboard
  const barcodeH = 10;
  page.drawImage(barcodeTopImg, {
    x: xPos(barcodeX),
    y: y(barcodeY) - hScale(barcodeH),
    width: wScale(barcodeW),
    height: hScale(barcodeH),
  });
  {
    const trackingTextPt = fontPt(11);
    const tw = bold.widthOfTextAtSize(input.trackingNumber, trackingTextPt);
    const cx = xPos(barcodeX) + wScale(barcodeW) / 2 - tw / 2;
    page.drawText(input.trackingNumber, { x: cx, y: y(barcodeY + barcodeH + 4.5), size: trackingTextPt, font: bold, color: BK });
  }

  // ── top/bottom separator ──────────────────────────────────────────
  line(0.8, 21, 101.2, 21, 1.2);

  // ── left content box ─────────────────────────────────────────────
  rect(2.2, 21, 60, 53, 1.2);
  line(2.2, 39.5, 62.2, 39.5, 1);
  line(2.2, 68, 62.2, 68, 1);
  line(32.2, 68, 32.2, 74, 1);

  // ── sender block ─────────────────────────────────────────────────
  // font sizes: old SVG used mm values; 1mm ≈ 2.835pt
  const senderLabel = `ผู้ส่ง : ${input.senderName}`;
  {
    const tw = regular.widthOfTextAtSize(senderLabel, fontPt(7.4));
    page.drawText(senderLabel, { x: xPos(32.2) - tw / 2, y: y(25.5), size: fontPt(7.4), font: regular, color: BK });
  }
  const senderLines = wrapText(input.senderAddress, 44, 2);
  senderLines.forEach((l, i) => {
    const tw = regular.widthOfTextAtSize(l, fontPt(6.2));
    page.drawText(l, { x: xPos(32.2) - tw / 2, y: y(29.2 + i * 3.1), size: fontPt(6.2), font: regular, color: BK });
  });
  {
    const tw = bold.widthOfTextAtSize(input.senderPhone, fontPt(8.5));
    page.drawText(input.senderPhone, { x: xPos(32.2) - tw / 2, y: y(37), size: fontPt(8.5), font: bold, color: BK });
  }

  // ── recipient block ───────────────────────────────────────────────
  const recipientLabel = `ผู้รับ : ${input.recipientName}`;
  {
    const tw = regular.widthOfTextAtSize(recipientLabel, fontPt(7.4));
    page.drawText(recipientLabel, { x: xPos(32.2) - tw / 2, y: y(43.6), size: fontPt(7.4), font: regular, color: BK });
  }
  const recipientLines = wrapText(input.recipientAddress, 44, 3);
  recipientLines.forEach((l, i) => {
    const tw = regular.widthOfTextAtSize(l, fontPt(6.2));
    page.drawText(l, { x: xPos(32.2) - tw / 2, y: y(46.9 + i * 3.1), size: fontPt(6.2), font: regular, color: BK });
  });
  {
    const tw = bold.widthOfTextAtSize(input.recipientPhone, fontPt(8.6));
    page.drawText(input.recipientPhone, { x: xPos(32.2) - tw / 2, y: y(56), size: fontPt(8.6), font: bold, color: BK });
  }

  // ── zip digit boxes ───────────────────────────────────────────────
  const digits = zipDigits(input.recipientZipcode);
  digits.forEach((digit, i) => {
    const dx = 8.6 + i * 9.7;
    rect(dx, 57.6, 8.5, 7.5, 1);
    if (digit) {
      const tw = bold.widthOfTextAtSize(digit, fontPt(13.6));
      page.drawText(digit, { x: xPos(dx) + wScale(8.5) / 2 - tw / 2, y: y(63.2), size: fontPt(13.6), font: bold, color: BK });
    }
  });

  // ── footer ────────────────────────────────────────────────────────
  txt(`Printed : ${formatPrintedAt()}`, 5.2, 71.5, fontPt(5.0));
  page.drawImage(barcodeFootImg, {
    x: xPos(33.2),
    y: y(69.2) - hScale(2.4),
    width: wScale(28),
    height: hScale(2.4),
  });
  {
    const itemsText = input.items.replace(/\s+/g, " ").trim() || "-";
    const tw = regular.widthOfTextAtSize(itemsText, fontPt(3));
    page.drawText(itemsText, { x: xPos(47.2) - tw / 2, y: y(73.5), size: fontPt(3), font: regular, color: BK });
  }

  // ── right service box ─────────────────────────────────────────────
  rect(64.5, 21, 30, 35, 1.2);
  line(64.5, 43, 94.5, 43, 1);
  line(64.5, 50, 94.5, 50, 1);
  line(84.5, 50, 84.5, 56, 1);

  const cx = 64.5;
  const cw = 30;
  const cLines: [string, number][] = [
    ["บริการจัดส่งสินค้า (e-Commerce)", 24.3],
    ["(บริการ e-Parcel)", 27.8],
    ["ใบอนุญาตสำหรับลูกค้าธุรกิจ", 31.5],
    ["เลขที่ ปณท ขล.(บม.4)/0059", 35],
    ["ชำระค่าฝากส่งตามที่ ปณท กำหนด", 38.8],
  ];
  for (const [text, yy] of cLines) {
    const tw = regular.widthOfTextAtSize(text, fontPt(5.4));
    page.drawText(text, { x: xPos(cx) + wScale(cw) / 2 - tw / 2, y: y(yy), size: fontPt(5.4), font: regular, color: BK });
  }
  {
    const tw = bold.widthOfTextAtSize("Non COD", fontPt(13.6));
    page.drawText("Non COD", { x: xPos(cx) + wScale(cw) / 2 - tw / 2, y: y(47.5), size: fontPt(13.6), font: bold, color: BK });
  }
  {
    drawCenteredText(
      page,
      bold,
      input.productInsuranceLabel,
      cx + 10,
      53.8,
      input.productInsuranceLabel === "-" ? fontPt(6.2) : fontPt(4.5),
      BK,
    );
  }
  {
    const tw = bold.widthOfTextAtSize("1", fontPt(11.1));
    page.drawText("1", { x: xPos(cx + 20) + wScale(10) / 2 - tw / 2, y: y(54.0), size: fontPt(11.1), font: bold, color: BK });
  }

  const rightNoticeBlocks: Array<{ lines: string[]; yStart: number; lineGap: number }> = [
    { lines: ["หากพบว่ามีความเสียหายหรือชำรุด"], yStart: 62.5, lineGap: 3.0 },
    { lines: ["กรุณาแจ้ง 081 487 8448"], yStart: 66.2, lineGap: 3.0 },
    { lines: ["ก่อนนำจ่ายถึงผู้รับ"], yStart: 69.9, lineGap: 3.0 },
  ];
  for (const block of rightNoticeBlocks) {
    drawCenteredLines(page, regular, block.lines, cx + cw / 2, block.yStart, fontPt(5.4), block.lineGap, BK);
  }

  // ── right-edge rotated fragile warning ────────────────────────────
  // With rotate(-90°) in pdf-lib (bottom-left origin), text flows downward.
  // x = horizontal position of the text baseline strip (~97mm = centre of right margin)
  // y = top starting point of the text (top of content area = 21mm from top → PH-mm(21))
  const fragile = "<< ข้างในนี้มีของสำคัญของใครบางคนอยู่ โปรดส่งต่ออย่างเบามือ >>";
  page.drawText(fragile, {
    x: xPos(98),
    y: y(22),
    size: fontPt(4.5),
    font: regular,
    color: BK,
    rotate: degrees(-90),
  });

  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

// ─── route ────────────────────────────────────────────────────────────────────
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token")?.trim() ?? "";

    let userId: string;

    if (token) {
      // Token path: used by LINE Flex message buttons (no active session required).
      const payload = verifyFlexToken(token);
      if (!payload || payload.action !== "label" || payload.parcelId !== id) {
        return NextResponse.json(
          { ok: false, error: "ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว" },
          { status: 403 },
        );
      }
      userId = payload.userId;
    } else {
      // Session path: used by in-app buttons (user is already logged in).
      const session = await requireLineSession();
      userId = session.userId;
    }

    const db = getDb();
    const parcelRows = await db
      .select()
      .from(parcels)
      .where(and(eq(parcels.id, id), eq(parcels.userId, userId)))
      .limit(1);
    const parcel = parcelRows[0];
    if (!parcel) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const orderRows = await db.select().from(orders).where(eq(orders.parcelId, id)).limit(1);
    const order = orderRows[0] ?? null;
    const trackingNumber = order?.barcode?.trim() || parcel.barcode?.trim() || parcel.trackingId.trim();
    if (!trackingNumber) return NextResponse.json({ ok: false, error: "Missing tracking number" }, { status: 400 });

    const pdf = await createParcelLabelPdf({
      trackingNumber,
      senderName: order?.shipperName?.trim() || "-",
      senderAddress: compactAddress([
        order?.shipperAddress, order?.shipperSubdistrict,
        order?.shipperDistrict, order?.shipperProvince, order?.shipperZipcode,
      ]) || "-",
      senderPhone: order?.shipperMobile?.trim() || "-",
      recipientName: order?.cusName?.trim() || "-",
      recipientAddress: compactAddress([
        order?.cusAdd, order?.cusSub, order?.cusAmp, order?.cusProv, order?.cusZipcode,
      ]) || parcel.destination || "-",
      recipientPhone: order?.cusTel?.trim() || "-",
      recipientZipcode: order?.cusZipcode?.trim() || "",
      weight: order?.productWeight?.trim() || (parcel.weightKg ? `${parcel.weightKg} kg` : "-"),
      items: order?.productInbox?.trim() || "-",
      productInsuranceLabel: formatProductInsuranceLabel(
        order?.productPrice,
        order?.insuranceRatePrice,
      ),
    });

    const filename = `parcel-label-${trackingNumber.replace(/[^\w-]+/g, "_")}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
