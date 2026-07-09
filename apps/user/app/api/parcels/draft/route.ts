import { and, eq } from "drizzle-orm";
import { getDb, orders, parcels, recipientAddresses, senderAddresses } from "@quickload/shared/db";
import { recordInternalEvent, recordSystemErrorEvent } from "@quickload/shared/internal-events";
import { sanitizeParcelNote } from "@quickload/shared/parcel-note";
import { resolveParcelDisplayCode } from "@quickload/shared/parcel-display-code";
import { NextResponse } from "next/server";
import {
  mapSmartpostInnerToOrderFields,
  parseSmartpostAddItemResponse,
} from "@/lib/smartpost-add-item";
import { resolveDraftIdempotency } from "./_draft-logic";
import { createOrderSuccessFlexMessage } from "@/lib/line-flex";
import { pushLineMessage } from "@/lib/line-messaging";
import { parsePositiveCm, validateParcelDimensionsCm } from "@/lib/parcel-dimensions";
import { requireLineSession } from "@/lib/require-user";
import { getSendAccessBlockForUser, sendAccessBlockedResponse } from "@/lib/send-access-block";
import { createFlexToken } from "@/lib/flex-token";
import { resolvePublicBaseUrl } from "@/lib/public-base-url";

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

    const sendBlock = await getSendAccessBlockForUser(session.userId);
    if (sendBlock.blocked) return sendAccessBlockedResponse();

    const body = (await request.json()) as CreateBody;

    const senderId = body.senderId?.trim();
    const recipientId = body.recipientId?.trim();
    const parcelType = body.parcelType?.trim() ?? "";
    const shippingMode = body.shippingMode === "pickup" ? "pickup" : "branch";
    const autoPrint = Boolean(body.autoPrint);
    const note = sanitizeParcelNote(body.note);

    const weightGram = toPositiveNumber(body.weightGram);
    const widthCm = parsePositiveCm(body.widthCm);
    const lengthCm = parsePositiveCm(body.lengthCm);
    const heightCm = parsePositiveCm(body.heightCm);

    if (!senderId || !recipientId) {
      return NextResponse.json({ ok: false, error: "senderId and recipientId are required" }, { status: 400 });
    }
    if (!weightGram || widthCm === null || lengthCm === null || heightCm === null) {
      return NextResponse.json({ ok: false, error: "weight and dimensions are required" }, { status: 400 });
    }
    const dimensionError = validateParcelDimensionsCm({ widthCm, lengthCm, heightCm });
    if (dimensionError) {
      return NextResponse.json({ ok: false, error: dimensionError }, { status: 400 });
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
    // statuscode "201" is injected by add-item route before forwarding; this is a sanity check only.
    if (parsedSmartpost.statuscode && parsedSmartpost.statuscode !== "201") {
      return NextResponse.json({ ok: false, error: "Smartpost order not successful" }, { status: 400 });
    }

    const smartpostFields = mapSmartpostInnerToOrderFields(parsedSmartpost.inner);
    const trackingId =
      smartpostFields.smartpostTrackingcode?.trim() || smartpostFields.barcode?.trim() || null;
    if (!trackingId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Smartpost did not return a tracking code or barcode. Please contact Smartpost support.",
        },
        { status: 400 },
      );
    }
    const parcelBarcode = smartpostFields.barcode?.trim() || null;

    const db = getDb();

    // Idempotency guard: a client retry (e.g. the first request succeeded but
    // the response never reached the client) re-submits the same Smartpost
    // tracking code. Replay the original success instead of failing on the
    // parcels_tracking_id_unique constraint.
    const [existingByTracking] = await db
      .select({ id: parcels.id, trackingId: parcels.trackingId, userId: parcels.userId })
      .from(parcels)
      .where(eq(parcels.trackingId, trackingId))
      .limit(1);
    const idempotency = resolveDraftIdempotency(existingByTracking, session.userId);
    if (idempotency.kind === "replay") {
      return NextResponse.json({
        ok: true,
        data: { id: idempotency.id, trackingId: idempotency.trackingId },
      });
    }
    if (idempotency.kind === "conflict") {
      // Should be impossible: carrier tracking codes are globally unique.
      await recordSystemErrorEvent({
        source: "user.api.parcels.draft.tracking_collision",
        error: new Error(`trackingId ${trackingId} belongs to a different user`),
        severity: "critical",
        context: { trackingId, existingParcelId: existingByTracking?.id },
      });
      return NextResponse.json(
        { ok: false, error: "เลขพัสดุนี้มีอยู่ในระบบแล้ว กรุณาติดต่อฝ่ายสนับสนุน" },
        { status: 409 },
      );
    }

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

    const f = smartpostFields;

    let parcelRow: typeof parcels.$inferSelect;
    try {
      parcelRow = await db.transaction(async (tx) => {
        const inserted = await tx
          .insert(parcels)
          .values({
            trackingId,
            barcode: parcelBarcode,
            userId: session.userId,
            destination,
            weightKg,
            size,
            parcelType,
            note,
            // Payment starts only after Thailand Post webhook sends final price (actual weight at branch).
            status: "awaiting_actual_weight",
            price: null,
            source: `send:${shippingMode}:${autoPrint ? "autoprint" : "manual"}`,
          })
          .returning();

        const row = inserted[0];
        if (!row?.id || !row.trackingId) {
          throw new Error("Failed to create parcel");
        }

        await tx.insert(orders).values({
          parcelId: row.id,
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

        return row;
      });
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code === "23505") {
        // Lost the race: another request (or retry) inserted this trackingId
        // between our pre-check and this insert. Replay its success instead
        // of surfacing a 500 for a duplicate-key error.
        const [race] = await db
          .select({ id: parcels.id, trackingId: parcels.trackingId, userId: parcels.userId })
          .from(parcels)
          .where(eq(parcels.trackingId, trackingId))
          .limit(1);
        const raceDecision = resolveDraftIdempotency(race, session.userId);
        if (raceDecision.kind === "replay") {
          return NextResponse.json({
            ok: true,
            data: { id: raceDecision.id, trackingId: raceDecision.trackingId },
          });
        }
      }
      throw err;
    }

    await recordInternalEvent("parcel.created", `parcel.created:${parcelRow.id}`, {
      parcelId: parcelRow.id,
      userId: session.userId,
      trackingId: parcelRow.trackingId,
      barcode: parcelRow.barcode,
      smartpostTrackingcode: f.smartpostTrackingcode || null,
      recipientProvince: recipient.province,
      recipientName: recipient.contactName,
      senderName: sender.contactName,
      weightGram,
      parcelType,
      shippingMode,
      autoPrint,
    });

    // Build and fire the LINE Flex message without blocking the HTTP response.
    // The order is already saved; a slow or failed LINE API call must not make
    // the user's app appear hung (critical on Android with low bandwidth).
    try {
      const barcode = f.barcode?.trim() || parcelRow.barcode?.trim() || "";
      const trackingNumber = resolveParcelDisplayCode({
        barcode,
        smartpostTrackingcode: f.smartpostTrackingcode,
        trackingId: parcelRow.trackingId,
      });
      const referenceCode = f.smartpostTrackingcode?.trim() || "";
      const publicBaseUrl = resolvePublicBaseUrl(request);

      const labelToken = createFlexToken({ userId: session.userId, parcelId: parcelRow.id, action: "label" });
      const trackToken = createFlexToken({ userId: session.userId, parcelId: parcelRow.id, action: "track" });

      const labelPdfUrl = publicBaseUrl
        ? new URL(
            `/api/parcels/${encodeURIComponent(parcelRow.id)}/label.pdf?token=${labelToken}`,
            publicBaseUrl,
          ).toString()
        : null;
      const trackingUrl = publicBaseUrl
        ? new URL(`/api/open/parcel?token=${trackToken}`, publicBaseUrl).toString()
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
      const lineUserId = session.lineUserId;
      // Fire-and-forget: push runs after the response is sent.
      void pushLineMessage({ to: lineUserId, message: flexMessage }).catch((lineErr: unknown) => {
        const msg = lineErr instanceof Error ? lineErr.message : String(lineErr);
        console.warn("[line-flex] send failed:", msg);
      });
    } catch (buildErr) {
      // Flex message construction failed (e.g. bad token). Log and move on.
      const msg = buildErr instanceof Error ? buildErr.message : String(buildErr);
      console.warn("[line-flex] build failed:", msg);
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
    await recordSystemErrorEvent({
      source: "user.api.parcels.draft",
      error: e,
    });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
