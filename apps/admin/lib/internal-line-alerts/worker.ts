import { and, asc, eq, inArray, lt, lte, or, sql } from "drizzle-orm";
import { readBulkMasterMeta } from "@quickload/shared/bulk-payment";
import { getDb, internalEvents, orders, parcels, payments, users } from "@quickload/shared/db";
import { resolveParcelDisplayCode } from "@quickload/shared/parcel-display-code";
import { sendInternalLineAlert } from "./send";
import {
  criticalErrorTemplate,
  parcelCreatedTemplate,
  paymentReceivedTemplate,
  userRegisteredTemplate,
} from "./templates";

type InternalEventRow = typeof internalEvents.$inferSelect;

const BATCH_LIMIT = 50;
const STALE_PROCESSING_MINUTES = 15;
const SENT_RETENTION_DAYS = 90;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function nextAttemptAfter(attemptCount: number): Date {
  const delayMinutes = Math.min(60, 5 * 2 ** Math.max(0, attemptCount - 1));
  return new Date(Date.now() + delayMinutes * 60_000);
}

async function claimEvents(limit = BATCH_LIMIT): Promise<InternalEventRow[]> {
  const db = getDb();
  const now = new Date();
  const staleProcessingBefore = new Date(Date.now() - STALE_PROCESSING_MINUTES * 60_000);
  const rows = await db
    .select()
    .from(internalEvents)
    .where(
      or(
        and(inArray(internalEvents.status, ["pending", "failed"]), lte(internalEvents.nextAttemptAt, now)),
        and(eq(internalEvents.status, "processing"), lt(internalEvents.updatedAt, staleProcessingBefore)),
      ),
    )
    .orderBy(asc(internalEvents.createdAt))
    .limit(limit);

  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return [];
  await db
    .update(internalEvents)
    .set({ status: "processing", updatedAt: new Date() })
    .where(inArray(internalEvents.id, ids));
  return rows;
}

async function markSent(id: string): Promise<void> {
  await getDb()
    .update(internalEvents)
    .set({ status: "sent", sentAt: new Date(), lastError: null, updatedAt: new Date() })
    .where(eq(internalEvents.id, id));
}

async function markFailed(row: InternalEventRow, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const nextAttemptCount = row.attemptCount + 1;
  await getDb()
    .update(internalEvents)
    .set({
      status: "failed",
      attemptCount: sql`${internalEvents.attemptCount} + 1`,
      nextAttemptAt: nextAttemptAfter(nextAttemptCount),
      lastError: message.slice(0, 1200),
      updatedAt: new Date(),
    })
    .where(eq(internalEvents.id, row.id));
}

async function cleanupSentEvents(): Promise<void> {
  const cutoff = new Date(Date.now() - SENT_RETENTION_DAYS * 24 * 60 * 60_000);
  await getDb()
    .delete(internalEvents)
    .where(and(eq(internalEvents.status, "sent"), lt(internalEvents.sentAt, cutoff)));
}

async function renderPaymentReceived(row: InternalEventRow): Promise<string> {
  const payload = asObject(row.payload);
  const paymentId = asString(payload.paymentId) ?? row.eventKey.replace(/^payment\.received:/, "");
  const [payment] = await getDb()
    .select({
      id: payments.id,
      amount: payments.amount,
      paymentMethod: payments.paymentMethod,
      parcelId: payments.parcelId,
      rawCreateResponse: payments.rawCreateResponse,
      barcode: parcels.barcode,
      trackingId: parcels.trackingId,
      displayName: users.displayName,
      firstName: users.firstName,
      lastName: users.lastName,
      phone: users.phone,
    })
    .from(payments)
    .leftJoin(parcels, eq(payments.parcelId, parcels.id))
    .leftJoin(users, eq(payments.userId, users.id))
    .where(eq(payments.id, paymentId))
    .limit(1);

  const bulkMeta = readBulkMasterMeta(payment?.rawCreateResponse);
  const customerName =
    [payment?.firstName, payment?.lastName].filter(Boolean).join(" ").trim() ||
    payment?.displayName ||
    null;

  return paymentReceivedTemplate({
    amount: bulkMeta?.totalCharged ?? payment?.amount ?? null,
    paymentMethod: payment?.paymentMethod ?? null,
    trackingCode: payment
      ? resolveParcelDisplayCode({ barcode: payment.barcode, trackingId: payment.trackingId })
      : null,
    customerName,
    customerPhone: payment?.phone ?? null,
    bulk: Boolean(bulkMeta) || asBoolean(payload.bulk),
    itemCount: bulkMeta?.itemCount ?? null,
    paymentId,
  });
}

async function renderParcelCreated(row: InternalEventRow): Promise<string> {
  const payload = asObject(row.payload);
  const parcelId = asString(payload.parcelId) ?? row.eventKey.replace(/^parcel\.created:/, "");
  const [parcel] = await getDb()
    .select({
      id: parcels.id,
      barcode: parcels.barcode,
      trackingId: parcels.trackingId,
      parcelType: parcels.parcelType,
      smartpostTrackingcode: orders.smartpostTrackingcode,
      productWeight: orders.productWeight,
      shipperName: orders.shipperName,
      cusName: orders.cusName,
      cusProv: orders.cusProv,
    })
    .from(parcels)
    .leftJoin(orders, eq(parcels.id, orders.parcelId))
    .where(eq(parcels.id, parcelId))
    .limit(1);

  return parcelCreatedTemplate({
    trackingCode: parcel
      ? resolveParcelDisplayCode({
          barcode: parcel.barcode,
          smartpostTrackingcode: parcel.smartpostTrackingcode,
          trackingId: parcel.trackingId,
        })
      : asString(payload.trackingId),
    referenceCode: parcel?.smartpostTrackingcode ?? asString(payload.smartpostTrackingcode),
    senderName: parcel?.shipperName ?? asString(payload.senderName),
    recipientName: parcel?.cusName ?? asString(payload.recipientName),
    recipientProvince: parcel?.cusProv ?? asString(payload.recipientProvince),
    weightGram: parcel?.productWeight ?? asNumber(payload.weightGram),
    parcelType: parcel?.parcelType ?? asString(payload.parcelType),
    parcelId,
  });
}

async function renderUserRegistered(row: InternalEventRow): Promise<string> {
  const payload = asObject(row.payload);
  const userId = asString(payload.userId) ?? row.eventKey.replace(/^user\.registered:/, "");
  const [user] = await getDb()
    .select({
      id: users.id,
      displayName: users.displayName,
      firstName: users.firstName,
      lastName: users.lastName,
      phone: users.phone,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return userRegisteredTemplate({
    userId,
    displayName: user?.displayName ?? asString(payload.displayName),
    firstName: user?.firstName ?? asString(payload.firstName),
    lastName: user?.lastName ?? asString(payload.lastName),
    phone: user?.phone ?? asString(payload.phone),
    email: user?.email ?? asString(payload.email),
  });
}

function renderSystemError(row: InternalEventRow): string {
  const payload = asObject(row.payload);
  return criticalErrorTemplate({
    source: asString(payload.source),
    severity: asString(payload.severity),
    message: asString(payload.message),
    context: payload.context,
    eventKey: row.eventKey,
  });
}

async function renderEvent(row: InternalEventRow): Promise<string> {
  if (row.type === "payment.received") return renderPaymentReceived(row);
  if (row.type === "parcel.created") return renderParcelCreated(row);
  if (row.type === "user.registered") return renderUserRegistered(row);
  if (row.type === "system.error") return renderSystemError(row);
  return criticalErrorTemplate({
    source: "admin.internal-line-alerts",
    severity: "warning",
    message: `Unknown internal event type: ${row.type}`,
    eventKey: row.eventKey,
  });
}

export async function processInternalLineAlerts(limit = BATCH_LIMIT): Promise<{
  claimed: number;
  sent: number;
  failed: number;
}> {
  const rows = await claimEvents(limit);
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const text = await renderEvent(row);
      await sendInternalLineAlert(text);
      await markSent(row.id);
      sent += 1;
    } catch (error) {
      await markFailed(row, error);
      failed += 1;
    }
  }

  await cleanupSentEvents();
  return { claimed: rows.length, sent, failed };
}
