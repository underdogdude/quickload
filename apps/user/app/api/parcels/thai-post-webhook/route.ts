import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import {
  mapThaiPostStatus,
  parseThaiPostStatusCodeRaw,
  resolveThaiPostStatusMetaCode,
} from "@quickload/shared/thai-post-status";
import { getDb, orders, parcels, thaiPostWebhookEvents, users } from "@quickload/shared/db";
import { thaiPostStatusDateToMs } from "@quickload/shared/thai-post-webhook-history";
import { NextResponse } from "next/server";
import { createPaymentDueFlexMessage } from "@/lib/line-flex";
import { pushLineMessage } from "@/lib/line-messaging";

type ThaiPostWebhookItem = {
  /** Thailand Post item id: 13 characters (e.g. WB222126989TH). */
  barcode?: string;
  status?: string;
  statusDescription?: string;
  statusDate?: string;
  station?: string;
};

function parseFinalCost(item: ThaiPostWebhookItem): string | null {
  const raw =
    (item as Record<string, unknown>).finalCost ??
    (item as Record<string, unknown>).finalcost ??
    (item as Record<string, unknown>).cost ??
    (item as Record<string, unknown>).price ??
    null;
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
  const token = process.env.THAI_POST_WEBHOOK_TOKEN?.trim();
  if (token) {
    const presented = request.headers.get("x-webhook-token")?.trim() ?? "";
    if (presented !== token) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  let payload: unknown = null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const events = Array.isArray(payload) ? payload : [payload];
  if (events.length === 0) {
    return NextResponse.json({ ok: true, updated: 0, ignored: 0 });
  }

  const db = getDb();
  const publicBaseUrl = resolvePublicBaseUrl(request);
  let updated = 0;
  let ignored = 0;
  const pendingPaymentNotifications: Array<{
    lineUserId: string;
    message: ReturnType<typeof createPaymentDueFlexMessage>;
  }> = [];

  /** Group all items in this POST by barcode (array or single object). */
  const byBarcode = new Map<string, BatchItem[]>();

  for (const rawEvent of events) {
    const event = (rawEvent ?? {}) as ThaiPostWebhookItem;
    const barcode = event.barcode?.trim();
    const statusCodeRaw = parseThaiPostStatusCodeRaw(event.status);
    if (!barcode || !statusCodeRaw) {
      ignored += 1;
      continue;
    }

    const knownCode = resolveThaiPostStatusMetaCode(statusCodeRaw);
    const mapped = knownCode ? mapThaiPostStatus(knownCode) : null;
    const descriptionTh =
      event.statusDescription?.trim() || mapped?.descriptionTh || "อัปเดตสถานะ";
    const finalCost = parseFinalCost(event);
    const statusDateRaw = event.statusDate?.trim() || null;
    const station = event.station?.trim() || null;

    const item: BatchItem = {
      rawEvent: rawEvent as Record<string, unknown>,
      event,
      statusCodeRaw,
      knownCode,
      mapped,
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
      for (const w of ordered) {
        if (w.mapped || w.finalCost) {
          const nextStatus =
            w.mapped &&
            (parcel.status === "paid" && w.mapped.parcelStatus === "pending_payment"
              ? "paid"
              : w.mapped.parcelStatus);

          const parcelPatch: {
            status?: string;
            price?: string;
            thaiPostPriceConfirmedAt?: Date;
            updatedAt: Date;
          } = {
            updatedAt: new Date(),
          };
          if (w.mapped && nextStatus) {
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
          }

          if (w.mapped || w.finalCost) {
            await tx
              .update(parcels)
              .set(parcelPatch)
              .where(and(eq(parcels.id, parcel.id), eq(parcels.barcode, barcode)));
          }
        }
      }

      if (shouldNotifyPaymentDue && notifyAmount && parcel.userId && publicBaseUrl) {
        const [user] = await tx
          .select({ lineUserId: users.lineUserId })
          .from(users)
          .where(eq(users.id, parcel.userId))
          .limit(1);
        if (user?.lineUserId) {
          const payUrl = new URL(`/pay/${encodeURIComponent(parcel.id)}`, publicBaseUrl).toString();
          pendingPaymentNotifications.push({
            lineUserId: user.lineUserId,
            message: createPaymentDueFlexMessage({
              parcelId: parcel.id,
              trackingNumber: parcel.trackingId || barcode,
              amountBaht: notifyAmount,
              payUrl,
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
      await pushLineMessage({
        to: n.lineUserId,
        message: n.message,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[line-flex] payment due send failed:", msg);
    }
  }

  return NextResponse.json({ ok: true, updated, ignored });
}
