import { createHmac, randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import {
  mapThaiPostStatus,
  parseThaiPostStatusCodeRaw,
  resolveThaiPostStatusMetaCode,
  type ParcelFlowStatus,
} from "@quickload/shared/thai-post-status";
import { getDb, orders, parcels, thaiPostWebhookEvents, users } from "@quickload/shared/db";
import { thaiPostStatusDateToMs } from "@quickload/shared/thai-post-webhook-history";
import { NextResponse } from "next/server";
import { createParcelStatusUpdateFlexMessage, createPaymentDueFlexMessage } from "@/lib/line-flex";
import { pushLineMessage } from "@/lib/line-messaging";

type ThaiPostWebhookItem = {
  /** Thailand Post item id: 13 characters (e.g. WB222126989TH). */
  barcode?: string;
  status?: string;
  statusDescription?: string;
  statusDate?: string;
  station?: string;
};

/**
 * Smartpost wraps the tracking data inside a top-level "payload" key.
 * Fall back to the raw event for flat formats.
 */
function resolveSmartpostEvent(rawEvent: Record<string, unknown>): Record<string, unknown> {
  if (rawEvent.payload && typeof rawEvent.payload === "object" && !Array.isArray(rawEvent.payload)) {
    return rawEvent.payload as Record<string, unknown>;
  }
  return rawEvent;
}

/**
 * Keyword-based parcel status mapping.
 *
 * Smartpost relays Thailand Post's raw status codes (e.g. "2", "71", "63") which do NOT match
 * our internal 1–20 scheme. Using statusDescription as primary truth is more reliable.
 */
function parcelStatusFromDescription(description: string): ParcelFlowStatus | null {
  if (!description) return null;
  if (description.includes("รับฝาก") || description.includes("ปณ.ต้นทาง")) return "pending_payment";
  if (description.includes("นำจ่ายถึงผู้รับ") || description.includes("นำจ่าย/ชำระเงิน")) return "delivered";
  if (
    description.includes("คัดแยก") ||
    description.includes("ระหว่างการขนส่ง") ||
    description.includes("สแกน") ||
    description.includes("ส่งออกจาก") ||
    description.includes("ถึงศูนย์")
  )
    return "in_transit";
  if (description.includes("ปลายทาง") || description.includes("เตรียมนำจ่าย") || description.includes("รอจ่าย ณ"))
    return "at_destination_post";
  if (description.includes("ส่งคืน")) return "returning";
  if (
    description.includes("จ่าหน้าไม่") ||
    description.includes("ไม่มีเลขบ้าน") ||
    description.includes("ไม่ยอมรับ") ||
    description.includes("ไม่มีผู้รับ") ||
    description.includes("ไม่มารับ")
  )
    return "failed";
  if (/drop/i.test(description)) return "canceled";
  return null;
}

function parseFinalCost(item: Record<string, unknown>): string | null {
  const raw = item.finalCost ?? item.finalcost ?? item.cost ?? item.price ?? null;
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(2);
}

type BatchItem = {
  rawEvent: Record<string, unknown>;
  event: ThaiPostWebhookItem;
  statusCodeRaw: string;
  knownCode: ReturnType<typeof resolveThaiPostStatusMetaCode>;
  mapped: ReturnType<typeof mapThaiPostStatus> | null;
  descriptionParcelStatus: ParcelFlowStatus | null;
  descriptionTh: string;
  finalCost: string | null;
  statusDateRaw: string | null;
  station: string | null;
};

/**
 * One POST may be a single object or an array of snapshots for the same barcode.
 * Thailand Post does not always send rows in chronological order — sort by `statusDate` when present.
 */
function orderBatchByCarrierTimeline(batch: BatchItem[]): BatchItem[] {
  return [...batch]
    .map((w, payloadOrder) => ({ w, payloadOrder }))
    .sort((a, b) => {
      const ta = thaiPostStatusDateToMs(a.w.statusDateRaw);
      const tb = thaiPostStatusDateToMs(b.w.statusDateRaw);
      if (ta != null && tb != null && ta !== tb) return ta - tb;
      if (ta != null && tb == null) return -1;
      if (ta == null && tb != null) return 1;
      return a.payloadOrder - b.payloadOrder;
    })
    .map(({ w }) => w);
}

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

export async function POST(request: Request) {
  // Always consume body as raw text so we can verify HMAC before parsing.
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json(
      { errorCode: 1, errorDetail: "Cannot read request body", status: "false" },
      { status: 400 },
    );
  }

  // HMAC-SHA256 verification (Smartpost sends X-Webhook-Signature).
  const hmacSecret = process.env.SMARTPOST_WEBHOOK_SECRET?.trim();
  if (hmacSecret) {
    const presented = request.headers.get("x-webhook-signature")?.trim() ?? "";
    const expected = createHmac("sha256", hmacSecret).update(rawBody).digest("hex");
    if (presented !== expected) {
      return NextResponse.json({ errorCode: 1, errorDetail: "Unauthorized", status: "false" }, { status: 401 });
    }
  } else {
    // Fallback: simple bearer token for non-Smartpost callers.
    const token = process.env.THAI_POST_WEBHOOK_TOKEN?.trim();
    if (token) {
      const presented = request.headers.get("x-webhook-token")?.trim() ?? "";
      if (presented !== token) {
        return NextResponse.json({ errorCode: 1, errorDetail: "Unauthorized", status: "false" }, { status: 401 });
      }
    }
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ errorCode: 1, errorDetail: "Invalid JSON body", status: "false" }, { status: 400 });
  }

  const events = Array.isArray(payload) ? payload : [payload];
  if (events.length === 0) {
    return NextResponse.json({ errorCode: 0, errorDetail: "success", status: "true", updated: 0, ignored: 0 });
  }

  const db = getDb();
  const publicBaseUrl = resolvePublicBaseUrl(request);
  let updated = 0;
  let ignored = 0;
  const pendingPaymentNotifications: Array<{
    lineUserId: string;
    message: ReturnType<typeof createPaymentDueFlexMessage>;
  }> = [];
  const pendingStatusNotifications: Array<{
    lineUserId: string;
    message: ReturnType<typeof createParcelStatusUpdateFlexMessage>;
  }> = [];

  /** Group all items in this POST by barcode (array or single object). */
  const byBarcode = new Map<string, BatchItem[]>();

  for (const rawEvent of events) {
    const raw = (rawEvent ?? {}) as Record<string, unknown>;
    // Normalize: Smartpost nests the tracking data inside a "payload" key at the top level.
    const resolved = resolveSmartpostEvent(raw);
    const event = resolved as ThaiPostWebhookItem;

    const barcode = event.barcode?.trim();
    const statusCodeRaw = parseThaiPostStatusCodeRaw(event.status);
    console.info(
      `[thai-post-webhook] barcode=${barcode ?? "null"} status=${JSON.stringify(event.status)} statusCodeRaw=${statusCodeRaw ?? "null"} finalcost=${JSON.stringify((resolved as Record<string,unknown>).finalcost ?? (resolved as Record<string,unknown>).finalCost ?? null)}`,
    );
    if (!barcode || !statusCodeRaw) {
      console.warn(`[thai-post-webhook] ignored: barcode=${barcode ?? "null"} statusCodeRaw=${statusCodeRaw ?? "null"}`);
      ignored += 1;
      continue;
    }

    const knownCode = resolveThaiPostStatusMetaCode(statusCodeRaw);
    const mapped = knownCode ? mapThaiPostStatus(knownCode) : null;

    // Description-based mapping is the primary source of truth for Smartpost webhooks:
    // Thailand Post raw codes (2, 63, 71…) differ from our internal 1–20 scheme.
    const descriptionRaw = event.statusDescription?.trim() ?? "";
    const descriptionParcelStatus = parcelStatusFromDescription(descriptionRaw);
    const descriptionTh = descriptionRaw || mapped?.descriptionTh || "อัปเดตสถานะ";

    const finalCost = parseFinalCost(resolved);
    const statusDateRaw = event.statusDate?.trim() || null;
    const station = event.station?.trim() || null;

    const item: BatchItem = {
      rawEvent: raw,
      event,
      statusCodeRaw,
      knownCode,
      mapped,
      descriptionParcelStatus,
      descriptionTh,
      finalCost,
      statusDateRaw,
      station,
    };

    const list = byBarcode.get(barcode) ?? [];
    list.push(item);
    byBarcode.set(barcode, list);
  }

  for (const [barcode, batch] of byBarcode) {
    const ordered = orderBatchByCarrierTimeline(batch);
    await db.transaction(async (tx) => {
      const parcelRows = await tx
        .select({
          id: parcels.id,
          status: parcels.status,
          userId: parcels.userId,
          trackingId: parcels.trackingId,
          thaiPostPriceConfirmedAt: parcels.thaiPostPriceConfirmedAt,
          price: parcels.price,
        })
        .from(parcels)
        .where(eq(parcels.barcode, barcode))
        .limit(1);
      const parcel = parcelRows[0];
      if (!parcel) {
        ignored += ordered.length;
        return;
      }

      let shouldNotifyPaymentDue = false;
      let notifyAmount: string | null = null;
      const statusChanges: Array<{ descriptionTh: string; station: string | null; toStatus: string }> = [];

      for (const w of ordered) {
        // Description-based mapping is more reliable for Smartpost: they reuse TP codes
        // with different meanings (e.g. code "2" sent as "ปณ.ต้นทางรับฝากแล้ว" should be
        // pending_payment, not delivered). Use description first; fall back to code only when
        // description yields nothing.
        const effectiveParcelStatus = w.descriptionParcelStatus ?? w.mapped?.parcelStatus;

        if (effectiveParcelStatus || w.finalCost) {
          // Never downgrade a paid parcel back to pending_payment.
          const nextStatus = effectiveParcelStatus
            ? parcel.status === "paid" && effectiveParcelStatus === "pending_payment"
              ? "paid"
              : effectiveParcelStatus
            : null;

          const parcelPatch: {
            status?: string;
            price?: string;
            thaiPostPriceConfirmedAt?: Date;
            updatedAt: Date;
          } = { updatedAt: new Date() };

          if (nextStatus) {
            // Track real status changes (excluding no-op transitions) for LINE notifications.
            if (nextStatus !== parcel.status) {
              statusChanges.push({ descriptionTh: w.descriptionTh, station: w.station, toStatus: nextStatus });
            }
            parcelPatch.status = nextStatus;
            parcel.status = nextStatus;
          }

          if (w.finalCost) {
            if (!shouldNotifyPaymentDue && notifyAmount == null && parcel.thaiPostPriceConfirmedAt == null) {
              shouldNotifyPaymentDue = true;
              notifyAmount = w.finalCost;
            }
            parcelPatch.price = w.finalCost;
            parcelPatch.thaiPostPriceConfirmedAt = new Date();
            // Keep in-memory consistent so subsequent loop iterations see the updated value.
            parcel.thaiPostPriceConfirmedAt = new Date();
          } else if (
            nextStatus === "pending_payment" &&
            parcel.thaiPostPriceConfirmedAt == null &&
            parcel.price != null &&
            Number(parcel.price) > 0
          ) {
            // Smartpost status webhooks omit finalcost — confirm the price using the parcel's
            // existing estimated price so the user can proceed to payment.
            if (!shouldNotifyPaymentDue && notifyAmount == null) {
              shouldNotifyPaymentDue = true;
              notifyAmount = parcel.price;
            }
            parcelPatch.thaiPostPriceConfirmedAt = new Date();
            parcel.thaiPostPriceConfirmedAt = new Date();
          }

          await tx
            .update(parcels)
            .set(parcelPatch)
            .where(and(eq(parcels.id, parcel.id), eq(parcels.barcode, barcode)));
        }
      }

      // Fetch lineUserId once for all notifications in this parcel's batch.
      const needsLineNotification =
        (shouldNotifyPaymentDue && notifyAmount != null && publicBaseUrl != null) ||
        statusChanges.length > 0;
      let lineUserId: string | null = null;
      if (parcel.userId && needsLineNotification) {
        const [user] = await tx
          .select({ lineUserId: users.lineUserId })
          .from(users)
          .where(eq(users.id, parcel.userId))
          .limit(1);
        lineUserId = user?.lineUserId ?? null;
      }

      console.info(
        `[thai-post-webhook] parcelId=${parcel.id} shouldNotify=${shouldNotifyPaymentDue} amount=${notifyAmount} hasUserId=${!!parcel.userId} hasBaseUrl=${!!publicBaseUrl} thaiPostPriceConfirmedAt=${parcel.thaiPostPriceConfirmedAt?.toISOString() ?? "null"} statusChanges=${statusChanges.length}`,
      );

      if (shouldNotifyPaymentDue && notifyAmount && lineUserId && publicBaseUrl) {
        const payUrl = new URL(`/pay/${encodeURIComponent(parcel.id)}`, publicBaseUrl).toString();
        pendingPaymentNotifications.push({
          lineUserId,
          message: createPaymentDueFlexMessage({
            parcelId: parcel.id,
            trackingNumber: parcel.trackingId || barcode,
            amountBaht: notifyAmount,
            payUrl,
          }),
        });
      }

      if (lineUserId) {
        for (const change of statusChanges) {
          // Skip pending_payment here when payment-due notification already covers it.
          if (change.toStatus === "pending_payment" && shouldNotifyPaymentDue) continue;
          pendingStatusNotifications.push({
            lineUserId,
            message: createParcelStatusUpdateFlexMessage({
              trackingNumber: parcel.trackingId || barcode,
              statusDescriptionTh: change.descriptionTh,
              station: change.station,
            }),
          });
        }
      }

      const receivedBase = Date.now();
      const historyEntries = ordered.map((w, i) => ({
        id: randomUUID(),
        barcode,
        status: w.statusCodeRaw,
        statusDescription: w.descriptionTh,
        statusDate: w.statusDateRaw,
        station: w.station,
        createdAt: new Date(receivedBase + i).toISOString(),
      }));

      const last = ordered[ordered.length - 1];
      const lastRaw = last.rawEvent;

      /**
       * Append in the database so concurrent webhooks cannot read stale `[]` and overwrite history.
       * `jsonb || jsonb` concatenates two arrays into one.
       */
      const historyChunkJson = JSON.stringify(historyEntries);
      await tx
        .insert(thaiPostWebhookEvents)
        .values({
          parcelId: parcel.id,
          barcode,
          statusCode: last.statusCodeRaw,
          statusDescription: last.descriptionTh,
          statusDateRaw: last.statusDateRaw,
          station: last.station,
          statusHistory: historyEntries,
          rawPayload: lastRaw,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: thaiPostWebhookEvents.parcelId,
          set: {
            barcode,
            statusCode: last.statusCodeRaw,
            statusDescription: last.descriptionTh,
            statusDateRaw: last.statusDateRaw,
            station: last.station,
            statusHistory: sql`(
              CASE
                WHEN jsonb_typeof(${thaiPostWebhookEvents.statusHistory}) = 'array'
                THEN ${thaiPostWebhookEvents.statusHistory}
                ELSE '[]'::jsonb
              END || ${historyChunkJson}::jsonb
            )`,
            rawPayload: lastRaw,
            updatedAt: new Date(),
          },
        });

      let lastFinalCost: string | undefined;
      for (const w of ordered) {
        if (w.finalCost) lastFinalCost = w.finalCost;
      }
      const orderPatch: { orderStatus: string; updatedAt: Date; finalcost?: string } = {
        orderStatus: `${last.statusCodeRaw}:${last.descriptionTh}`,
        updatedAt: new Date(),
      };
      if (lastFinalCost) {
        orderPatch.finalcost = lastFinalCost;
      }
      await tx.update(orders).set(orderPatch).where(eq(orders.parcelId, parcel.id));

      updated += ordered.length;
    });
  }

  for (const n of pendingPaymentNotifications) {
    try {
      await pushLineMessage({ to: n.lineUserId, message: n.message });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[line-flex] payment due send failed:", msg);
    }
  }

  for (const n of pendingStatusNotifications) {
    try {
      await pushLineMessage({ to: n.lineUserId, message: n.message });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[line-flex] status update send failed:", msg);
    }
  }

  // Smartpost checks for exactly {"errorDetail":"success","status":"true"} to mark sent_to_webhook=1.
  return NextResponse.json({ errorCode: 0, errorDetail: "success", status: "true", updated, ignored });
}
