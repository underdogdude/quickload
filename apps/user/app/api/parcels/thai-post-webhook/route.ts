import { createHmac, randomUUID } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";
import {
  isTerminalParcelStatus,
  mapThaiPostStatus,
  parseThaiPostStatusCodeRaw,
  parseTerminalParcelStatusNotificationType,
  resolveThaiPostStatusMetaCode,
  TERMINAL_PARCEL_STATUSES,
  terminalParcelStatusNotificationType,
  type ParcelFlowStatus,
  type TerminalParcelStatus,
} from "@quickload/shared/thai-post-status";
import { getDb, notificationLog, orders, parcels, thaiPostWebhookEvents, users } from "@quickload/shared/db";
import { thaiPostStatusDateToMs, resolveCarrierWebhookConfirmedAt } from "@quickload/shared/thai-post-webhook-history";
import { resolveParcelDisplayCode } from "@quickload/shared/parcel-display-code";
import {
  computeBillableTotalFromTier,
  formatBillablePriceThb,
  parseWebhookWeightGrams,
  weightKgFromGrams,
} from "@quickload/shared/parcel-billable-price";
import { lookupSellPriceThbForWeight } from "@quickload/shared/pricing-tier-lookup";
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

function smartpostEnvelopeTimestamp(rawEvent: Record<string, unknown>): string | null {
  if (typeof rawEvent.timeStamp === "string") return rawEvent.timeStamp;
  if (typeof rawEvent.timestamp === "string") return rawEvent.timestamp;
  return null;
}

function resolveFirstPriceConfirmedAt(w: BatchItem): Date {
  return resolveCarrierWebhookConfirmedAt(w.statusDateRaw, smartpostEnvelopeTimestamp(w.rawEvent));
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
  weightGrams: number | null;
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

const TERMINAL_STATUS_NOTIFICATION_TYPES = TERMINAL_PARCEL_STATUSES.map(
  terminalParcelStatusNotificationType,
);

type SentTerminalStatusMap = Map<string, Set<TerminalParcelStatus>>;

const PAYMENT_DUE_NOTIFICATION_TYPE = "payment_due";

function parcelIdFromNotificationPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const parcelId = (payload as { parcelId?: unknown }).parcelId;
  return typeof parcelId === "string" && parcelId.trim() ? parcelId.trim() : null;
}

async function loadSentTerminalParcelStatusNotifications(): Promise<SentTerminalStatusMap> {
  const db = getDb();
  const map: SentTerminalStatusMap = new Map();
  const rows = await db
    .select({ type: notificationLog.type, payload: notificationLog.payload })
    .from(notificationLog)
    .where(
      and(inArray(notificationLog.type, TERMINAL_STATUS_NOTIFICATION_TYPES), eq(notificationLog.status, "sent")),
    );

  for (const row of rows) {
    const terminalStatus = parseTerminalParcelStatusNotificationType(row.type);
    const parcelId = parcelIdFromNotificationPayload(row.payload);
    if (!terminalStatus || !parcelId) continue;
    const set = map.get(parcelId) ?? new Set<TerminalParcelStatus>();
    set.add(terminalStatus);
    map.set(parcelId, set);
  }
  return map;
}

async function loadSentPaymentDueParcelIds(): Promise<Set<string>> {
  const db = getDb();
  const sent = new Set<string>();
  const rows = await db
    .select({ payload: notificationLog.payload })
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.type, PAYMENT_DUE_NOTIFICATION_TYPE),
        inArray(notificationLog.status, ["sent", "pending"]),
      ),
    );

  for (const row of rows) {
    const parcelId = parcelIdFromNotificationPayload(row.payload);
    if (parcelId) sent.add(parcelId);
  }
  return sent;
}

async function hasPaymentDueNotification(
  executor: Pick<ReturnType<typeof getDb>, "select">,
  parcelId: string,
): Promise<boolean> {
  const rows = await executor
    .select({ id: notificationLog.id })
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.type, PAYMENT_DUE_NOTIFICATION_TYPE),
        inArray(notificationLog.status, ["sent", "pending"]),
        sql`${notificationLog.payload}->>'parcelId' = ${parcelId}`,
      ),
    )
    .limit(1);
  return rows.length > 0;
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
  const sentTerminalStatuses = await loadSentTerminalParcelStatusNotifications();
  const sentPaymentDueParcelIds = await loadSentPaymentDueParcelIds();
  let updated = 0;
  let ignored = 0;
  const pendingPaymentNotifications: Array<{
    lineUserId: string;
    userId: string;
    parcelId: string;
    message: ReturnType<typeof createPaymentDueFlexMessage>;
  }> = [];
  const pendingStatusNotifications: Array<{
    lineUserId: string;
    userId: string;
    parcelId: string;
    terminalStatus: TerminalParcelStatus;
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
    const parsedWeightGrams = parseWebhookWeightGrams(resolved);
    console.info(
      `[thai-post-webhook] barcode=${barcode ?? "null"} status=${JSON.stringify(event.status)} statusCodeRaw=${statusCodeRaw ?? "null"} weight=${parsedWeightGrams ?? "null"} finalcost=${JSON.stringify((resolved as Record<string, unknown>).finalcost ?? (resolved as Record<string, unknown>).finalCost ?? null)}`,
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
    const weightGrams = parsedWeightGrams;
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
      weightGrams,
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
          isPaid: parcels.isPaid,
          thaiPostPriceConfirmedAt: parcels.thaiPostPriceConfirmedAt,
          price: parcels.price,
        })
        .from(parcels)
        .where(eq(parcels.barcode, barcode))
        .limit(1)
        .for("update");
      const parcel = parcelRows[0];
      if (!parcel) {
        ignored += ordered.length;
        return;
      }

      const orderRows = await tx
        .select({
          cusZipcode: orders.cusZipcode,
          productPrice: orders.productPrice,
          insuranceRatePrice: orders.insuranceRatePrice,
        })
        .from(orders)
        .where(eq(orders.parcelId, parcel.id))
        .limit(1);
      const order = orderRows[0];

      let shouldNotifyPaymentDue = false;
      let notifyAmount: string | null = null;
      // Tracks status transitions for LINE terminal notifications (delivered / failed / canceled).
      const statusChanges: Array<{ descriptionTh: string; station: string | null; toStatus: string | null }> = [];
      const seenDescriptions = new Set<string>();

      for (const w of ordered) {
        // Description-based mapping is more reliable for Smartpost: they reuse TP codes
        // with different meanings (e.g. code "2" sent as "ปณ.ต้นทางรับฝากแล้ว" should be
        // pending_payment, not delivered). Use description first; fall back to code only when
        // description yields nothing.
        const effectiveParcelStatus = w.descriptionParcelStatus ?? w.mapped?.parcelStatus;

        if (effectiveParcelStatus || w.finalCost || (w.weightGrams != null && w.weightGrams > 0)) {
          // Never downgrade a paid parcel back to pending_payment.
          const nextStatus = effectiveParcelStatus
            ? parcel.isPaid && effectiveParcelStatus === "pending_payment"
              ? parcel.status
              : effectiveParcelStatus
            : null;

          const parcelPatch: {
            status?: string;
            price?: string;
            weightKg?: string;
            thaiPostPriceConfirmedAt?: Date;
            updatedAt: Date;
          } = { updatedAt: new Date() };

          if (nextStatus) {
            // Track real status changes (excluding no-op transitions) for LINE notifications.
            if (nextStatus !== parcel.status && !seenDescriptions.has(w.descriptionTh)) {
              statusChanges.push({ descriptionTh: w.descriptionTh, station: w.station, toStatus: nextStatus });
              seenDescriptions.add(w.descriptionTh);
            }
            parcelPatch.status = nextStatus;
            parcel.status = nextStatus;
          }

          // Billable price = Sell tier(actual weight) + remote + insurance — never raw finalcost.
          if (!parcel.isPaid && w.weightGrams != null && w.weightGrams > 0) {
            const tier = await lookupSellPriceThbForWeight(tx, w.weightGrams);
            if (tier) {
              const billable = computeBillableTotalFromTier(tier.priceThb, {
                cusZipcode: order?.cusZipcode,
                productPrice: order?.productPrice,
                insuranceRatePrice: order?.insuranceRatePrice,
              });
              const priceStr = formatBillablePriceThb(billable.totalBaht);
              const firstConfirm = parcel.thaiPostPriceConfirmedAt == null;
              if (firstConfirm && !shouldNotifyPaymentDue) {
                shouldNotifyPaymentDue = true;
                notifyAmount = priceStr;
              }
              parcelPatch.price = priceStr;
              parcelPatch.weightKg = weightKgFromGrams(w.weightGrams);
              // Immutable after first confirm — Thai Post resends weight on every status webhook.
              if (firstConfirm) {
                const confirmedAt = resolveFirstPriceConfirmedAt(w);
                parcelPatch.thaiPostPriceConfirmedAt = confirmedAt;
                parcel.thaiPostPriceConfirmedAt = confirmedAt;
              }
              parcel.price = priceStr;
              console.info(
                `[thai-post-webhook] billable parcelId=${parcel.id} weightG=${w.weightGrams} tier=${tier.weightUpToGrams}g shipping=${billable.shippingTierBaht} remote=${billable.remoteAreaBaht} insurance=${billable.insuranceBaht} total=${priceStr} carrierFinalcost=${w.finalCost ?? "null"}`,
              );
            } else {
              console.warn(
                `[thai-post-webhook] weight tier lookup failed parcelId=${parcel.id} weightG=${w.weightGrams}`,
              );
            }
          } else if (
            w.finalCost &&
            !parcel.isPaid &&
            parcel.thaiPostPriceConfirmedAt == null &&
            (w.weightGrams == null || w.weightGrams <= 0)
          ) {
            console.warn(
              `[thai-post-webhook] finalcost without weight — carrier cost stored on order only parcelId=${parcel.id} finalcost=${w.finalCost}`,
            );
          }

          const hasParcelFieldChanges = Object.keys(parcelPatch).some((key) => key !== "updatedAt");
          if (hasParcelFieldChanges) {
            await tx
              .update(parcels)
              .set(parcelPatch)
              .where(and(eq(parcels.id, parcel.id), eq(parcels.barcode, barcode)));
          }
        }
      }

      // If any webhook arrived for a priced parcel but thaiPostPriceConfirmedAt was never set
      // (Smartpost cron omits finalcost from all tracking events), confirm the price now so the
      // outstanding tab and the payment route can see it.
      if (parcel.price != null && Number(parcel.price) > 0 && parcel.thaiPostPriceConfirmedAt == null) {
        const weightWebhook = ordered.find((item) => item.weightGrams != null && item.weightGrams > 0);
        const source = weightWebhook ?? ordered.at(-1);
        const confirmedAt = source
          ? resolveFirstPriceConfirmedAt(source)
          : new Date();
        await tx
          .update(parcels)
          .set({ thaiPostPriceConfirmedAt: confirmedAt, updatedAt: new Date() })
          .where(and(eq(parcels.id, parcel.id), eq(parcels.barcode, barcode)));
        parcel.thaiPostPriceConfirmedAt = confirmedAt;
        if (!shouldNotifyPaymentDue && notifyAmount == null) {
          shouldNotifyPaymentDue = true;
          notifyAmount = parcel.price;
        }
      }

      // Fetch lineUserId once for all notifications in this parcel's batch.
      const hasTerminalTransition = statusChanges.some(
        (change) => change.toStatus && isTerminalParcelStatus(change.toStatus),
      );
      const needsLineNotification =
        (shouldNotifyPaymentDue && notifyAmount != null && publicBaseUrl != null) ||
        hasTerminalTransition;
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

      if (
        shouldNotifyPaymentDue &&
        notifyAmount &&
        lineUserId &&
        publicBaseUrl &&
        parcel.userId &&
        !parcel.isPaid &&
        !sentPaymentDueParcelIds.has(parcel.id) &&
        !(await hasPaymentDueNotification(tx, parcel.id))
      ) {
        const payUrl = new URL(`/pay/${encodeURIComponent(parcel.id)}`, publicBaseUrl).toString();
        await tx.insert(notificationLog).values({
          userId: parcel.userId,
          lineUserId,
          type: PAYMENT_DUE_NOTIFICATION_TYPE,
          payload: { parcelId: parcel.id },
          status: "pending",
        });
        sentPaymentDueParcelIds.add(parcel.id);
        pendingPaymentNotifications.push({
          lineUserId,
          userId: parcel.userId,
          parcelId: parcel.id,
          message: createPaymentDueFlexMessage({
            parcelId: parcel.id,
            trackingNumber: resolveParcelDisplayCode({ barcode, trackingId: parcel.trackingId }),
            amountBaht: notifyAmount,
            payUrl,
          }),
        });
      } else if (shouldNotifyPaymentDue && (sentPaymentDueParcelIds.has(parcel.id) || (await hasPaymentDueNotification(tx, parcel.id)))) {
        console.info(
          `[thai-post-webhook] skip duplicate payment_due parcelId=${parcel.id} (already sent or queued)`,
        );
      }

      if (lineUserId && parcel.userId) {
        const terminalChanges = statusChanges.filter(
          (change) => change.toStatus && isTerminalParcelStatus(change.toStatus),
        );
        const terminalChange = terminalChanges.at(-1);
        if (terminalChange?.toStatus && isTerminalParcelStatus(terminalChange.toStatus)) {
          const terminalStatus = terminalChange.toStatus;
          const alreadySent = sentTerminalStatuses.get(parcel.id)?.has(terminalStatus);
          if (!alreadySent) {
            pendingStatusNotifications.push({
              lineUserId,
              userId: parcel.userId,
              parcelId: parcel.id,
              terminalStatus,
              message: createParcelStatusUpdateFlexMessage({
                trackingNumber: resolveParcelDisplayCode({ barcode, trackingId: parcel.trackingId }),
                statusDescriptionTh: terminalChange.descriptionTh,
                terminalStatus,
              }),
            });
            const sentForParcel = sentTerminalStatuses.get(parcel.id) ?? new Set<TerminalParcelStatus>();
            sentForParcel.add(terminalStatus);
            sentTerminalStatuses.set(parcel.id, sentForParcel);
          }
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
      let lastWeightGrams: number | undefined;
      for (const w of ordered) {
        if (w.finalCost) lastFinalCost = w.finalCost;
        if (w.weightGrams != null && w.weightGrams > 0) lastWeightGrams = w.weightGrams;
      }
      const orderPatch: {
        orderStatus: string;
        updatedAt: Date;
        finalcost?: string;
        productWeight?: string;
      } = {
        orderStatus: `${last.statusCodeRaw}:${last.descriptionTh}`,
        updatedAt: new Date(),
      };
      if (lastFinalCost) {
        orderPatch.finalcost = lastFinalCost;
      }
      if (lastWeightGrams != null) {
        orderPatch.productWeight = String(lastWeightGrams);
      }
      await tx.update(orders).set(orderPatch).where(eq(orders.parcelId, parcel.id));

      updated += ordered.length;
    });
  }

  for (const n of pendingPaymentNotifications) {
    let sendStatus: "sent" | "failed" = "sent";
    try {
      await pushLineMessage({ to: n.lineUserId, message: n.message });
    } catch (e) {
      sendStatus = "failed";
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[line-flex] payment due send failed:", msg);
    }
    try {
      const updated = await db
        .update(notificationLog)
        .set({ status: sendStatus })
        .where(
          and(
            eq(notificationLog.type, PAYMENT_DUE_NOTIFICATION_TYPE),
            eq(notificationLog.status, "pending"),
            sql`${notificationLog.payload}->>'parcelId' = ${n.parcelId}`,
          ),
        )
        .returning({ id: notificationLog.id });
      if (updated.length === 0) {
        await db.insert(notificationLog).values({
          userId: n.userId,
          lineUserId: n.lineUserId,
          type: PAYMENT_DUE_NOTIFICATION_TYPE,
          payload: { parcelId: n.parcelId },
          status: sendStatus,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[line-flex] payment due notification log failed:", msg);
    }
  }

  for (const n of pendingStatusNotifications) {
    let sendStatus: "sent" | "failed" = "sent";
    try {
      await pushLineMessage({ to: n.lineUserId, message: n.message });
    } catch (e) {
      sendStatus = "failed";
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[line-flex] status update send failed:", msg);
    }
    try {
      await db.insert(notificationLog).values({
        userId: n.userId,
        lineUserId: n.lineUserId,
        type: terminalParcelStatusNotificationType(n.terminalStatus),
        payload: {
          parcelId: n.parcelId,
          terminalStatus: n.terminalStatus,
        },
        status: sendStatus,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[line-flex] status update notification log failed:", msg);
    }
  }

  // Smartpost checks for exactly {"errorDetail":"success","status":"true"} to mark sent_to_webhook=1.
  return NextResponse.json({ errorCode: 0, errorDetail: "success", status: "true", updated, ignored });
}
