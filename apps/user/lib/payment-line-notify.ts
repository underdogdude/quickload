import { eq } from "drizzle-orm";
import { getDb, parcels, payments, users } from "@quickload/shared/db";
import { createPaymentFailedFlexMessage, createPaymentSuccessFlexMessage } from "@/lib/line-flex";
import { pushLineMessage } from "@/lib/line-messaging";

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
    .select({ userId: parcels.userId, barcode: parcels.barcode, trackingId: parcels.trackingId })
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
      trackingNumber: parcel.barcode || parcel.trackingId,
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
    .select({ userId: parcels.userId, barcode: parcels.barcode, trackingId: parcels.trackingId })
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
      trackingNumber: parcel.barcode || parcel.trackingId,
      amountBaht: payment.amount,
      reason,
    }),
  });
}
