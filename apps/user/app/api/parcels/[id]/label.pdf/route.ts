import { getDb, orders, parcels } from "@quickload/shared/db";
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
const W_MM = 102;
const H_MM = 76;
const PW = W_MM * PT_PER_MM; // page width  in pt
const PH = H_MM * PT_PER_MM; // page height in pt
const mm = (v: number) => v * PT_PER_MM;

// pdf-lib origin is bottom-left; we author in top-left coords
const y = (topMm: number) => PH - mm(topMm);

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
      cur = w.slice(0, maxChars);
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines.length ? lines : [text.slice(0, maxChars)];
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
    page.drawLine({ start: { x: mm(x1), y: y(y1) }, end: { x: mm(x2), y: y(y2) }, thickness, color: BK });

  const rect = (xMm: number, yMm: number, wMm: number, hMm: number, thickness = 0.8) =>
    page.drawRectangle({ x: mm(xMm), y: y(yMm) - mm(hMm), width: mm(wMm), height: mm(hMm), borderColor: BK, borderWidth: thickness, color: WHITE });

  // Draw text — top-left baseline aligned
  const txt = (
    str: string,
    xMm: number,
    yMm: number,
    sizePt: number,
    opts?: { bold?: boolean; center?: boolean; centerWidthMm?: number },
  ) => {
    const font = opts?.bold ? bold : regular;
    let drawX = mm(xMm);
    if (opts?.center && opts.centerWidthMm != null) {
      const textW = font.widthOfTextAtSize(str, sizePt);
      drawX = mm(xMm) + (mm(opts.centerWidthMm) - textW) / 2;
    }
    page.drawText(str, { x: drawX, y: y(yMm), size: sizePt, font, color: BK });
  };

  // ── outer border ─────────────────────────────────────────────────
  rect(0.8, 0.8, 100.4, 74.4, 1.5);

  // ── logo (natural ratio 3.66:1 → fix height to 12mm, width = 12*3.66 = 43.9mm) ─
  const logoH = 12;
  const logoW = logoH * (644 / 176); // ~43.9mm keeps aspect ratio
  const logoTopMm = (21 - logoH) / 2; // vertically centre in 21mm band
  page.drawImage(logoImg, { x: mm(1.8), y: y(logoTopMm + logoH), width: mm(logoW), height: mm(logoH) });

  // ── top barcode (starts after logo, fits within page 102mm) ──────
  const barcodeX = 47;          // start after logo (~1.8+43.9+1.5 gap)
  const barcodeY = 2.5;
  const barcodeW = 52;          // 47+52=99mm — fits within 101.2mm border
  const barcodeH = 10;
  page.drawImage(barcodeTopImg, { x: mm(barcodeX), y: y(barcodeY) - mm(barcodeH), width: mm(barcodeW), height: mm(barcodeH) });
  {
    const tw = bold.widthOfTextAtSize(input.trackingNumber, 7);
    const cx = mm(barcodeX) + mm(barcodeW) / 2 - tw / 2;
    page.drawText(input.trackingNumber, { x: cx, y: y(barcodeY + barcodeH + 2.5), size: 7, font: bold, color: BK });
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
    const tw = regular.widthOfTextAtSize(senderLabel, 7.4);
    page.drawText(senderLabel, { x: mm(32.2) - tw / 2, y: y(25.5), size: 7.4, font: regular, color: BK });
  }
  const senderLines = wrapText(input.senderAddress, 44, 2);
  senderLines.forEach((l, i) => {
    const tw = regular.widthOfTextAtSize(l, 6.2);
    page.drawText(l, { x: mm(32.2) - tw / 2, y: y(29.2 + i * 3.1), size: 6.2, font: regular, color: BK });
  });
  {
    const tw = bold.widthOfTextAtSize(input.senderPhone, 8.5);
    page.drawText(input.senderPhone, { x: mm(32.2) - tw / 2, y: y(37), size: 8.5, font: bold, color: BK });
  }

  // ── recipient block ───────────────────────────────────────────────
  const recipientLabel = `ผู้รับ : ${input.recipientName}`;
  {
    const tw = regular.widthOfTextAtSize(recipientLabel, 7.4);
    page.drawText(recipientLabel, { x: mm(32.2) - tw / 2, y: y(43.6), size: 7.4, font: regular, color: BK });
  }
  const recipientLines = wrapText(input.recipientAddress, 66, 3);
  recipientLines.forEach((l, i) => {
    const tw = regular.widthOfTextAtSize(l, 5.0);
    page.drawText(l, { x: mm(32.2) - tw / 2, y: y(46.9 + i * 2.6), size: 5.0, font: regular, color: BK });
  });
  {
    const tw = bold.widthOfTextAtSize(input.recipientPhone, 8.6);
    page.drawText(input.recipientPhone, { x: mm(32.2) - tw / 2, y: y(56), size: 8.6, font: bold, color: BK });
  }

  // ── zip digit boxes ───────────────────────────────────────────────
  const digits = zipDigits(input.recipientZipcode);
  digits.forEach((digit, i) => {
    const dx = 8.6 + i * 9.7;
    rect(dx, 57.6, 8.5, 7.5, 1);
    if (digit) {
      const tw = bold.widthOfTextAtSize(digit, 13.6);
      page.drawText(digit, { x: mm(dx) + mm(8.5) / 2 - tw / 2, y: y(63.2), size: 13.6, font: bold, color: BK });
    }
  });

  // ── footer ────────────────────────────────────────────────────────
  txt(`Printed : ${formatPrintedAt()}`, 5.2, 71.5, 5.0);
  page.drawImage(barcodeFootImg, { x: mm(33.2), y: y(69.2) - mm(2.4), width: mm(28), height: mm(2.4) });
  {
    const itemsText = input.items.replace(/\s+/g, " ").trim() || "-";
    const tw = regular.widthOfTextAtSize(itemsText, 3);
    page.drawText(itemsText, { x: mm(47.2) - tw / 2, y: y(73.5), size: 3, font: regular, color: BK });
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
    const tw = regular.widthOfTextAtSize(text, 5.4);
    page.drawText(text, { x: mm(cx) + mm(cw) / 2 - tw / 2, y: y(yy), size: 5.4, font: regular, color: BK });
  }
  {
    const tw = bold.widthOfTextAtSize("Non COD", 13.6);
    page.drawText("Non COD", { x: mm(cx) + mm(cw) / 2 - tw / 2, y: y(47.5), size: 13.6, font: bold, color: BK });
  }
  {
    const tw = bold.widthOfTextAtSize("-", 11.1);
    page.drawText("-", { x: mm(cx) + mm(10) / 2 - tw / 2, y: y(53.3), size: 11.1, font: bold, color: BK });
  }
  {
    const tw = bold.widthOfTextAtSize("1", 11.1);
    page.drawText("1", { x: mm(cx + 20) + mm(10) / 2 - tw / 2, y: y(53.3), size: 11.1, font: bold, color: BK });
  }

  const rightLines: [string, number][] = [
    ["พัสดุชิ้นนี้มีคนรอรับอยู่ปลายทาง", 59.7],
    ["หากพบว่ามีความเสียหายหรือชำรุด", 63.4],
    ["กรุณาแจ้ง 081 487 8448", 67.1],
    ["ก่อนนำจ่ายถึงผู้รับ", 70.8],
  ];
  for (const [text, yy] of rightLines) {
    const tw = regular.widthOfTextAtSize(text, 5.7);
    page.drawText(text, { x: mm(cx) + mm(cw) / 2 - tw / 2, y: y(yy), size: 5.7, font: regular, color: BK });
  }

  // ── right-edge rotated fragile warning ────────────────────────────
  // With rotate(-90°) in pdf-lib (bottom-left origin), text flows downward.
  // x = horizontal position of the text baseline strip (~97mm = centre of right margin)
  // y = top starting point of the text (top of content area = 21mm from top → PH-mm(21))
  const fragile = "<< ข้างในนี้มีของสำคัญของใครบางคนอยู่ โปรดส่งต่ออย่างเบามือ >>";
  page.drawText(fragile, {
    x: mm(98),
    y: PH - mm(22),
    size: 4.5,
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
