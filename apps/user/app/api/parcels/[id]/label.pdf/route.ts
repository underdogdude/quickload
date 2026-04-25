import { getDb, orders, parcels } from "@quickload/shared/db";
import bwipjs from "bwip-js/node";
import { and, eq } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { requireLineSession } from "@/lib/require-user";

export const runtime = "nodejs";

const MM_TO_PT = 72 / 25.4;
const pageWidth = 102 * MM_TO_PT;
const pageHeight = 76 * MM_TO_PT;

function mm(value: number) {
  return value * MM_TO_PT;
}

function compact(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => part?.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
}

function compactAddress(parts: Array<string | null | undefined>) {
  const segments: string[] = [];
  for (const raw of parts) {
    if (!raw) continue;
    const cleaned = raw
      .replace(/\s+/g, " ")
      .replace(/[,\u060C\uFE50\uFF0C]+/g, ",")
      .replace(/\s*,\s*/g, ",")
      .trim();
    if (!cleaned) continue;
    for (const piece of cleaned.split(",")) {
      const token = piece.trim();
      if (!token) continue;
      if (segments[segments.length - 1] === token) continue;
      segments.push(token);
    }
  }
  return segments.join(", ");
}

function zipDigits(zipcode: string) {
  const digits = zipcode.replace(/\D/g, "").slice(0, 5);
  return Array.from({ length: 5 }, (_, i) => digits[i] ?? "");
}

function formatPrintedAt() {
  return new Date().toLocaleString("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
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

function resolvePublicPath(relativePath: string): string {
  const normalized = relativePath.replace(/^\/+/, "");
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "public", normalized),
    path.join(cwd, "apps", "user", "public", normalized),
  ];
  for (const p of candidates) {
    try {
      require("node:fs").accessSync(p);
      return p;
    } catch {
      // try next
    }
  }
  return candidates[0];
}

async function readPublicFile(relativePath: string) {
  const normalized = relativePath.replace(/^\/+/, "");
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "public", normalized),
    path.join(cwd, "apps", "user", "public", normalized),
  ];
  for (const filePath of candidates) {
    try {
      return await readFile(filePath);
    } catch {
      // try next
    }
  }
  throw new Error(`Public asset not found: ${relativePath}`);
}

function xmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

const quickloadLogoPromise = readPublicFile("quickload-logo.png");

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
}) {
  // Render at 300 dpi equivalent for 102x76mm
  const renderWidth = 1224;
  const renderHeight = 912;
  const sx = renderWidth / 102;
  const sy = renderHeight / 76;
  const x = (v: number) => Math.round(v * sx);
  const y = (v: number) => Math.round(v * sy);
  const w = (v: number) => Math.round(v * sx);
  const h = (v: number) => Math.round(v * sy);
  // Font size: value in mm -> SVG px at render scale
  const fs = (v: number) => Math.round(v * sy);

  const sarabunRegularPath = resolvePublicPath("fonts/Sarabun/Sarabun-Regular.ttf");
  const sarabunBoldPath = resolvePublicPath("fonts/Sarabun/Sarabun-Bold.ttf");
  const sarabunRegularUrl = `file://${sarabunRegularPath}`;
  const sarabunBoldUrl = `file://${sarabunBoldPath}`;

  const [barcode, footerBarcode, quickloadLogo] = await Promise.all([
    barcodePng(input.trackingNumber, { scale: 3, height: 11 }),
    barcodePng(input.trackingNumber, { scale: 2, height: 6 }),
    quickloadLogoPromise,
  ]);
  const barcodeBase64 = barcode.toString("base64");
  const footerBarcodeBase64 = footerBarcode.toString("base64");
  const quickloadLogoBase64 = quickloadLogo.toString("base64");
  const digits = zipDigits(input.recipientZipcode);

  const barcodeX = 43.5;
  const barcodeY = 2.8;
  const barcodeW = 63;
  const barcodeH = 9.5;
  const trackingCenterX = barcodeX + barcodeW / 2;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${renderWidth}" height="${renderHeight}" viewBox="0 0 ${renderWidth} ${renderHeight}">
  <defs>
    <style>
      @font-face {
        font-family: "Sarabun";
        font-weight: normal;
        src: url("${sarabunRegularUrl}") format("truetype");
      }
      @font-face {
        font-family: "Sarabun";
        font-weight: bold;
        src: url("${sarabunBoldUrl}") format("truetype");
      }
      text { font-family: "Sarabun", sans-serif; fill: #111; }
    </style>
  </defs>

  <!-- outer border -->
  <rect x="${x(0.8)}" y="${y(0.8)}" width="${w(100.4)}" height="${h(74.4)}" fill="#fff" stroke="#111" stroke-width="2"/>

  <!-- top band separator -->
  <line x1="${x(0.8)}" y1="${y(21)}" x2="${x(101.2)}" y2="${y(21)}" stroke="#111" stroke-width="1.5"/>

  <!-- logo + barcode -->
  <image x="${x(1.8)}" y="${y(1)}" width="${w(45)}" height="${h(20)}" href="data:image/png;base64,${quickloadLogoBase64}"/>
  <image x="${x(barcodeX)}" y="${y(barcodeY)}" width="${w(barcodeW)}" height="${h(barcodeH)}" href="data:image/png;base64,${barcodeBase64}"/>
  <text x="${x(trackingCenterX)}" y="${y(18.5)}" font-size="${fs(4.9)}" font-weight="bold" text-anchor="middle" dominant-baseline="auto">${xmlEscape(input.trackingNumber)}</text>

  <!-- left sender/recipient box -->
  <rect x="${x(2.2)}" y="${y(21)}" width="${w(60)}" height="${h(53)}" fill="none" stroke="#111" stroke-width="1.5"/>
  <line x1="${x(2.2)}" y1="${y(39.5)}" x2="${x(62.2)}" y2="${y(39.5)}" stroke="#111" stroke-width="1.5"/>
  <line x1="${x(2.2)}" y1="${y(68)}" x2="${x(62.2)}" y2="${y(68)}" stroke="#111" stroke-width="1.5"/>
  <line x1="${x(32.2)}" y1="${y(68)}" x2="${x(32.2)}" y2="${y(74)}" stroke="#111" stroke-width="1.5"/>

  <!-- sender block -->
  <text x="${x(32.2)}" y="${y(25.5)}" font-size="${fs(2.8)}" text-anchor="middle" dominant-baseline="auto">${xmlEscape(`ผู้ส่ง : ${input.senderName}`)}</text>
  <text x="${x(32.2)}" y="${y(29.8)}" font-size="${fs(2.3)}" text-anchor="middle" dominant-baseline="auto">${xmlEscape(input.senderAddress)}</text>
  <text x="${x(32.2)}" y="${y(35)}" font-size="${fs(3)}" text-anchor="middle" dominant-baseline="auto" font-weight="bold" >${xmlEscape(input.senderPhone)}</text>

  <!-- recipient block -->
  <text x="${x(32.2)}" y="${y(44.4)}" font-size="${fs(3.2)}" text-anchor="middle" dominant-baseline="auto">${xmlEscape(`ผู้รับ : ${input.recipientName}`)}</text>
  <text x="${x(32.2)}" y="${y(49.7)}" font-size="${fs(2.6)}" text-anchor="middle" dominant-baseline="auto">${xmlEscape(input.recipientAddress)}</text>
  <text x="${x(32.2)}" y="${y(55)}" font-size="${fs(3.5)}" text-anchor="middle" dominant-baseline="auto" font-weight="bold" >${xmlEscape(input.recipientPhone)}</text>

  <!-- zip digit boxes -->
  ${digits
    .map((digit, i) => {
      const dx = 8.6 + i * 9.7;
      return `<rect x="${x(dx)}" y="${y(57.6)}" width="${w(8.5)}" height="${h(7.5)}" fill="none" stroke="#111" stroke-width="1.1"/>
  <text x="${x(dx + 4.2)}" y="${y(63.2)}" font-size="${fs(4.8)}" text-anchor="middle" dominant-baseline="auto">${xmlEscape(digit)}</text>`;
    })
    .join("\n  ")}

  <!-- footer -->
  <text x="${x(5.2)}" y="${y(71.5)}" font-size="${fs(1.75)}" dominant-baseline="auto">${xmlEscape(`Printed : ${formatPrintedAt()}`)}</text>
  <image x="${x(33.2)}" y="${y(69.2)}" width="${w(28)}" height="${h(2.4)}" href="data:image/png;base64,${footerBarcodeBase64}"/>
  <text x="${x(47.2)}" y="${y(73.2)}" font-size="${fs(1.2)}" text-anchor="middle" dominant-baseline="auto">ของแห้ง</text>

  <!-- right service box -->
  <rect x="${x(64.5)}" y="${y(21)}" width="${w(30)}" height="${h(35)}" fill="none" stroke="#111" stroke-width="1.5"/>
  <line x1="${x(64.5)}" y1="${y(43)}" x2="${x(94.5)}" y2="${y(43)}" stroke="#111" stroke-width="1.2"/>
  <line x1="${x(64.5)}" y1="${y(50)}" x2="${x(94.5)}" y2="${y(50)}" stroke="#111" stroke-width="1.2"/>
  <line x1="${x(84.5)}" y1="${y(50)}" x2="${x(84.5)}" y2="${y(56)}" stroke="#111" stroke-width="1.2"/>

  <text x="${x(79.5)}" y="${y(24.3)}" font-size="${fs(1.9)}" text-anchor="middle" dominant-baseline="auto">บริการจัดส่งสินค้า (e-Commerce)</text>
  <text x="${x(79.5)}" y="${y(27.8)}" font-size="${fs(1.9)}" text-anchor="middle" dominant-baseline="auto">(บริการ e-Parcel)</text>
  <text x="${x(79.5)}" y="${y(31.5)}" font-size="${fs(1.9)}" text-anchor="middle" dominant-baseline="auto">ใบอนุญาตสำหรับลูกค้าธุรกิจ</text>
  <text x="${x(79.5)}" y="${y(35)}" font-size="${fs(1.9)}" text-anchor="middle" dominant-baseline="auto">เลขที่ ปณท ขล.(บม.4)/0059</text>
  <text x="${x(79.5)}" y="${y(38.8)}" font-size="${fs(1.9)}" text-anchor="middle" dominant-baseline="auto">ชำระค่าฝากส่งตามที่ ปณท กำหนด</text>
  <text x="${x(79.5)}" y="${y(47.5)}" font-size="${fs(4.8)}" text-anchor="middle" dominant-baseline="auto">Non COD</text>
  <text x="${x(74.5)}" y="${y(53.3)}" font-size="${fs(3.9)}" text-anchor="middle" dominant-baseline="auto">-</text>
  <text x="${x(89.5)}" y="${y(53.3)}" font-size="${fs(3.9)}" text-anchor="middle" dominant-baseline="auto">1</text>

  <text x="${x(79.5)}" y="${y(59.7)}" font-size="${fs(2)}" text-anchor="middle" dominant-baseline="auto">พัสดุชิ้นนี้มีคนรอรับอยู่ปลายทาง</text>
  <text x="${x(79.5)}" y="${y(63.4)}" font-size="${fs(2)}" text-anchor="middle" dominant-baseline="auto">หากพบว่ามีความเสียหายหรือชำรุด</text>
  <text x="${x(79.5)}" y="${y(67.1)}" font-size="${fs(2)}" text-anchor="middle" dominant-baseline="auto">กรุณาแจ้ง 081 487 8448</text>
  <text x="${x(79.5)}" y="${y(70.8)}" font-size="${fs(2)}" text-anchor="middle" dominant-baseline="auto">ก่อนนำจ่ายถึงผู้รับ</text>

  <!-- right-edge fragile warning rotated -->
  <text
    x="${x(88)}"
    y="${y(76 / 2)}"
    font-size="${fs(1.8)}"
    text-anchor="middle"
    dominant-baseline="middle"
    transform="rotate(-90, ${x(98)}, ${y(76 / 2)})"
  >&lt;&lt; ข้างในนี้มีของสำคัญของใครบางคนอยู่ โปรดส่งต่ออย่างเบามือ &gt;&gt;</text>
</svg>`;

  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 8 }).toBuffer();

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  const labelImage = await pdfDoc.embedPng(png);
  page.drawImage(labelImage, { x: 0, y: 0, width: pageWidth, height: pageHeight });

  return Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireLineSession();
    const { id } = await context.params;
    const db = getDb();
    const parcelRows = await db
      .select()
      .from(parcels)
      .where(and(eq(parcels.id, id), eq(parcels.userId, session.userId)))
      .limit(1);
    const parcel = parcelRows[0];
    if (!parcel) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    const orderRows = await db.select().from(orders).where(eq(orders.parcelId, id)).limit(1);
    const order = orderRows[0] ?? null;
    const trackingNumber = order?.barcode?.trim() || parcel.barcode?.trim() || parcel.trackingId.trim();
    if (!trackingNumber) {
      return NextResponse.json({ ok: false, error: "Missing tracking number" }, { status: 400 });
    }

    const pdf = await createParcelLabelPdf({
      trackingNumber,
      senderName: order?.shipperName?.trim() || "-",
      senderAddress:
        compactAddress([
          order?.shipperAddress,
          order?.shipperSubdistrict,
          order?.shipperDistrict,
          order?.shipperProvince,
          order?.shipperZipcode,
        ]) || "-",
      senderPhone: order?.shipperMobile?.trim() || "-",
      recipientName: order?.cusName?.trim() || "-",
      recipientAddress:
        compactAddress([order?.cusAdd, order?.cusSub, order?.cusAmp, order?.cusProv, order?.cusZipcode]) ||
        parcel.destination ||
        "-",
      recipientPhone: order?.cusTel?.trim() || "-",
      recipientZipcode: order?.cusZipcode?.trim() || "",
      weight: order?.productWeight?.trim() || (parcel.weightKg ? `${parcel.weightKg} kg` : "-"),
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
