import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import { getDb, payments } from "@quickload/shared/db";
import { NextResponse } from "next/server";

function decodeDataImageToPngBuffer(dataUrl: string): Buffer | null {
  const m = /^data:image\/png;base64,(.+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  try {
    return Buffer.from(m[1], "base64");
  } catch {
    return null;
  }
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

    const payload = payment.qrPayload.trim();
    let png: Buffer;
    if (payload.startsWith("data:image/")) {
      const decoded = decodeDataImageToPngBuffer(payload);
      if (!decoded) return new NextResponse("Unsupported QR image format", { status: 415 });
      png = decoded;
    } else {
      png = await QRCode.toBuffer(payload, {
        type: "png",
        width: 1024,
        margin: 1,
      });
    }

    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return new NextResponse(msg, { status: 500 });
  }
}

