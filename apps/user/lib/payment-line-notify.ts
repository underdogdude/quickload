import { eq, inArray } from "drizzle-orm";
import { readBulkMasterMeta } from "@quickload/shared/bulk-payment";
import { getDb, parcels, payments, users } from "@quickload/shared/db";
import {
  createBulkPaymentSuccessFlexMessage,
  createPaymentFailedFlexMessage,
  createPaymentSuccessFlexMessage,
} from "@/lib/line-flex";
import { pushLineMessage } from "@/lib/line-messaging";

/** Bulk failures are surfaced on /pay/all — avoid a misleading single-parcel flex. */
export async function sendPaymentTerminalFlexIfSingle(
  paymentId: string,
  parcelId: string,
  reason: "failed" | "expired" | "canceled",
  opts?: { bulk?: boolean },
): Promise<void> {
  if (opts?.bulk) return;
  const db = getDb();
  const [payment] = await db
    .select({ rawCreateResponse: payments.rawCreateResponse })
    .from(payments)
    .where(eq(payments.id, paymentId))
    .limit(1);
  if (readBulkMasterMeta(payment?.rawCreateResponse)) return;
  await sendPaymentFailedFlexForPayment(paymentId, parcelId, reason);
}

export async function sendBulkPaymentSuccessFlex(paymentId: string): Promise<void> {
  const db = getDb();
  const [payment] = await db
    .select({
      amount: payments.amount,
      rawCreateResponse: payments.rawCreateResponse,
      userId: payments.userId,
    })
    .from(payments)
    .where(eq(payments.id, paymentId))
    .limit(1);
  if (!payment?.userId) return;

  const bulkMeta = readBulkMasterMeta(payment.rawCreateResponse);
  const amountBaht = bulkMeta?.totalCharged ?? payment.amount;
  const parcelIds = bulkMeta?.parcelIds ?? [];
  if (parcelIds.length === 0) return;

  const parcelRows = await db
    .select({
      id: parcels.id,
      barcode: parcels.barcode,
    })
    .from(parcels)
    .where(inArray(parcels.id, parcelIds));

  const parcelMap = new Map(parcelRows.map((row) => [row.id, row]));

  const barcodes = parcelIds.map((parcelId) => parcelMap.get(parcelId)?.barcode?.trim() || "-");

  const [user] = await db
    .select({ lineUserId: users.lineUserId })
    .from(users)
    .where(eq(users.id, payment.userId))
    .limit(1);
  if (!user?.lineUserId) return;

  await pushLineMessage({
    to: user.lineUserId,
    message: createBulkPaymentSuccessFlexMessage({
      barcodes,
      amountBaht,
    }),
  });
}

export async function sendPaymentSuccessFlexForPayment(
  paymentId: string,
  parcelId: string,
): Promise<void> {
  const db = getDb();
  const [payment] = await db
    .select({ amount: payments.amount })
    .from(payments)
    .where(eq(payments.id, paymentId))
    .limit(1);
  const [parcel] = await db
    .select({ userId: parcels.userId, barcode: parcels.barcode })
    .from(parcels)
    .where(eq(parcels.id, parcelId))
    .limit(1);
  if (!parcel?.userId || !payment) return;
  const [user] = await db
    .select({ lineUserId: users.lineUserId })
    .from(users)
    .where(eq(users.id, parcel.userId))
    .limit(1);
  if (!user?.lineUserId) return;
  await pushLineMessage({
    to: user.lineUserId,
    message: createPaymentSuccessFlexMessage({
      trackingNumber: parcel.barcode?.trim() || "-",
      amountBaht: payment.amount,
    }),
  });
}

export async function sendPaymentFailedFlexForPayment(
  paymentId: string,
  parcelId: string,
  reason: "failed" | "expired" | "canceled",
): Promise<void> {
  const db = getDb();
  const [payment] = await db
    .select({ amount: payments.amount })
    .from(payments)
    .where(eq(payments.id, paymentId))
    .limit(1);
  const [parcel] = await db
    .select({ userId: parcels.userId, barcode: parcels.barcode })
    .from(parcels)
    .where(eq(parcels.id, parcelId))
    .limit(1);
  if (!parcel?.userId || !payment) return;
  const [user] = await db
    .select({ lineUserId: users.lineUserId })
    .from(users)
    .where(eq(users.id, parcel.userId))
    .limit(1);
  if (!user?.lineUserId) return;
  await pushLineMessage({
    to: user.lineUserId,
    message: createPaymentFailedFlexMessage({
      trackingNumber: parcel.barcode?.trim() || "-",
      amountBaht: payment.amount,
      reason,
    }),
  });
}
