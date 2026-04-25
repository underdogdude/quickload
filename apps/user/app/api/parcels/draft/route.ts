import { and, eq } from "drizzle-orm";
import { getDb, orders, parcels, recipientAddresses, senderAddresses } from "@quickload/shared/db";
import { NextResponse } from "next/server";
import {
  mapSmartpostInnerToOrderFields,
  parseSmartpostAddItemResponse,
} from "@/lib/smartpost-add-item";
import { createOrderSuccessFlexMessage } from "@/lib/line-flex";
import { pushLineMessage } from "@/lib/line-messaging";
import { requireLineSession } from "@/lib/require-user";

function resolvePublicBaseUrl(request: Request): string | null {
  const envBase =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_BASE_URL?.trim() ||
    process.env.PUBLIC_BASE_URL?.trim() ||
    "";
  if (envBase) return envBase.replace(/\/+$/, "");

  const forwardedProto = request.headers.get("x-forwarded-proto")?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.trim();
  if (forwardedProto && forwardedHost && !/^(0\.0\.0\.0|localhost)(:\d+)?$/i.test(forwardedHost)) {
    return `${forwardedProto}://${forwardedHost}`.replace(/\/+$/, "");
  }

  try {
    const origin = new URL(request.url).origin;
    const host = new URL(origin).host;
    if (/^(0\.0\.0\.0|localhost)(:\d+)?$/i.test(host)) return null;
    return origin.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

type CreateBody = {
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
  /** Client-supplied base estimated price in baht; used if Smartpost finalcost is missing. */
  estimatedPrice?: string;
  /** Required: raw JSON from Smartpost addItem after HTTP 201 / statuscode 201. */
  smartpostAddItemResponse: unknown;
};

function toPositiveNumber(value?: string) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Persists parcel + order only after Smartpost addItem succeeds. */
export async function POST(request: Request) {
  try {
    const session = await requireLineSession();
    const body = (await request.json()) as CreateBody;

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

    if (body.smartpostAddItemResponse === undefined || body.smartpostAddItemResponse === null) {
      return NextResponse.json(
        { ok: false, error: "smartpostAddItemResponse is required; parcels must be created via Smartpost addItem" },
        { status: 400 },
      );
    }

    const parsedSmartpost = parseSmartpostAddItemResponse(body.smartpostAddItemResponse);
    if (!parsedSmartpost) {
      return NextResponse.json({ ok: false, error: "Invalid smartpostAddItemResponse" }, { status: 400 });
    }
    if (parsedSmartpost.statuscode !== "201") {
      return NextResponse.json({ ok: false, error: "Smartpost order not successful" }, { status: 400 });
    }

    const smartpostFields = mapSmartpostInnerToOrderFields(parsedSmartpost.inner);
    const trackingId =
      smartpostFields.smartpostTrackingcode?.trim() || smartpostFields.barcode?.trim() || null;
    if (!trackingId) {
      return NextResponse.json(
        { ok: false, error: "Smartpost response missing smartpost_trackingcode and barcode" },
        { status: 400 },
      );
    }
    const parcelBarcode = smartpostFields.barcode?.trim() || null;

    let parcelPrice: string | null = null;
    if (smartpostFields.finalcost?.trim()) {
      const p = Number(smartpostFields.finalcost);
      if (Number.isFinite(p) && p > 0) parcelPrice = p.toFixed(2);
    }
    if (!parcelPrice && body.estimatedPrice) {
      const p = Number(body.estimatedPrice);
      if (Number.isFinite(p) && p > 0) parcelPrice = p.toFixed(2);
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
    // Keep parcel dimensions in parcels.size only.
    // Parcel type is already persisted in order fields (e.g. productInbox/items).
    const size = `${widthCm}x${lengthCm}x${heightCm}cm`;
    const weightKg = (weightGram / 1000).toFixed(3);

    const inserted = await db
      .insert(parcels)
      .values({
        trackingId,
        barcode: parcelBarcode,
        userId: session.userId,
        destination,
        weightKg,
        size,
        status: "pending_payment",
        price: parcelPrice,
        source: `send:${shippingMode}:${autoPrint ? "autoprint" : "manual"}${note ? ":note" : ""}`,
      })
      .returning();

    const parcelRow = inserted[0];
    if (!parcelRow?.id || !parcelRow.trackingId) {
      return NextResponse.json({ ok: false, error: "Failed to create parcel" }, { status: 500 });
    }

    const f = smartpostFields;
    await db.insert(orders).values({
      parcelId: parcelRow.id,
      userId: session.userId,
      statuscode: parsedSmartpost.statuscode,
      message: parsedSmartpost.message,
      smartpostTrackingcode: f.smartpostTrackingcode || null,
      barcode: f.barcode || null,
      serviceType: f.serviceType || null,
      productInbox: f.productInbox || null,
      productWeight: f.productWeight || null,
      productPrice: f.productPrice || null,
      shipperName: f.shipperName || null,
      shipperAddress: f.shipperAddress || null,
      shipperSubdistrict: f.shipperSubdistrict || null,
      shipperDistrict: f.shipperDistrict || null,
      shipperProvince: f.shipperProvince || null,
      shipperZipcode: f.shipperZipcode || null,
      shipperEmail: f.shipperEmail || null,
      shipperMobile: f.shipperMobile || null,
      cusName: f.cusName || null,
      cusAdd: f.cusAdd || null,
      cusSub: f.cusSub || null,
      cusAmp: f.cusAmp || null,
      cusProv: f.cusProv || null,
      cusZipcode: f.cusZipcode || null,
      cusTel: f.cusTel || null,
      cusEmail: f.cusEmail || null,
      customerCode: f.customerCode || null,
      cost: f.cost.trim() ? f.cost : null,
      finalcost: f.finalcost.trim() ? f.finalcost : null,
      orderStatus: f.orderStatus || null,
      items: f.items || null,
      insuranceRatePrice: f.insuranceRatePrice || null,
      referenceId: f.referenceId || null,
    });

    try {
      const barcode = f.barcode?.trim() || parcelRow.barcode?.trim() || "";
      const trackingNumber = barcode || parcelRow.trackingId;
      const referenceCode = f.smartpostTrackingcode?.trim() || "";
      const publicBaseUrl = resolvePublicBaseUrl(request);
      const trackingUrl = publicBaseUrl ? new URL("/tracking", publicBaseUrl).toString() : null;
      const labelPdfUrl = publicBaseUrl
        ? new URL(`/api/parcels/${encodeURIComponent(parcelRow.id)}/label.pdf`, publicBaseUrl).toString()
        : null;
      const qrCodeImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(
        trackingNumber,
      )}`;
      const flexMessage = createOrderSuccessFlexMessage({
        trackingNumber,
        referenceCode: referenceCode && referenceCode !== trackingNumber ? referenceCode : null,
        senderName: sender.contactName,
        senderPhone: sender.phone,
        recipientName: recipient.contactName,
        recipientPhone: recipient.phone,
        weightGram,
        sizeText: `${widthCm} x ${lengthCm} x ${heightCm} ซม.`,
        parcelType,
        trackingUrl,
        labelPdfUrl,
        qrCodeImageUrl,
      });
      await pushLineMessage({
        to: session.lineUserId,
        message: flexMessage,
      });
    } catch (lineErr) {
      const msg = lineErr instanceof Error ? lineErr.message : String(lineErr);
      console.warn("[line-flex] send failed:", msg);
    }

    return NextResponse.json({
      ok: true,
      data: {
        id: parcelRow.id,
        trackingId: parcelRow.trackingId,
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
