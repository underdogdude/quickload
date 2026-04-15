import { and, eq } from "drizzle-orm";
import { getDb, parcels, recipientAddresses, senderAddresses } from "@quickload/shared/db";
import { NextResponse } from "next/server";
import { requireLineSession } from "@/lib/require-user";

type DraftBody = {
  senderId?: string;
  recipientId?: string;
  shippingMode?: "branch" | "pickup";
  autoPrint?: boolean;
  weightGram?: string;
  widthCm?: string;
  lengthCm?: string;
  heightCm?: string;
  parcelType?: string;
  note?: string;
};

function toPositiveNumber(value?: string) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function generateDraftTrackingId() {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `QLDRAFT-${Date.now()}-${random}`;
}

export async function POST(request: Request) {
  try {
    const session = await requireLineSession();
    const body = (await request.json()) as DraftBody;

    const senderId = body.senderId?.trim();
    const recipientId = body.recipientId?.trim();
    const parcelType = body.parcelType?.trim() ?? "";
    const shippingMode = body.shippingMode === "pickup" ? "pickup" : "branch";
    const autoPrint = Boolean(body.autoPrint);
    const note = body.note?.trim() ?? "";

    const weightGram = toPositiveNumber(body.weightGram);
    const widthCm = toPositiveNumber(body.widthCm);
    const lengthCm = toPositiveNumber(body.lengthCm);
    const heightCm = toPositiveNumber(body.heightCm);

    if (!senderId || !recipientId) {
      return NextResponse.json({ ok: false, error: "senderId and recipientId are required" }, { status: 400 });
    }
    if (!weightGram || !widthCm || !lengthCm || !heightCm) {
      return NextResponse.json({ ok: false, error: "weight and dimensions are required" }, { status: 400 });
    }
    if (!parcelType) {
      return NextResponse.json({ ok: false, error: "parcelType is required" }, { status: 400 });
    }

    const db = getDb();
    const [sender] = await db
      .select()
      .from(senderAddresses)
      .where(and(eq(senderAddresses.id, senderId), eq(senderAddresses.userId, session.userId)))
      .limit(1);
    const [recipient] = await db
      .select()
      .from(recipientAddresses)
      .where(and(eq(recipientAddresses.id, recipientId), eq(recipientAddresses.userId, session.userId)))
      .limit(1);

    if (!sender || !recipient) {
      return NextResponse.json({ ok: false, error: "Sender or recipient not found" }, { status: 404 });
    }

    const destination = `${recipient.contactName} · ${recipient.amphoe}, ${recipient.province}`;
    const size = `${widthCm}x${lengthCm}x${heightCm}cm · ${parcelType}`;
    const trackingId = generateDraftTrackingId();
    const weightKg = (weightGram / 1000).toFixed(3);

    const inserted = await db
      .insert(parcels)
      .values({
        trackingId,
        userId: session.userId,
        destination,
        weightKg,
        size,
        status: "draft",
        source: `send:${shippingMode}:${autoPrint ? "autoprint" : "manual"}${note ? ":note" : ""}`,
      })
      .returning();

    return NextResponse.json({
      ok: true,
      data: {
        id: inserted[0]?.id,
        trackingId: inserted[0]?.trackingId,
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

