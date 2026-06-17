import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb, payments, type payments as paymentsTable } from "./db";
import { readBulkChildMeta, readBulkMasterMeta } from "./bulk-payment";

export type PaymentRow = typeof paymentsTable.$inferSelect;

export async function expireBulkPaymentGroup(
  db: ReturnType<typeof getDb>,
  master: Pick<PaymentRow, "id" | "rawCreateResponse">,
): Promise<void> {
  const bulkMeta = readBulkMasterMeta(master.rawCreateResponse);
  if (!bulkMeta) return;
  const now = new Date();
  await db
    .update(payments)
    .set({ status: "expired", updatedAt: now })
    .where(
      and(
        inArray(payments.id, [master.id, ...bulkMeta.childPaymentIds]),
        eq(payments.status, "pending"),
      ),
    );
}

export async function resolveBulkMasterPayment(
  db: ReturnType<typeof getDb>,
  payment: PaymentRow,
): Promise<PaymentRow> {
  if (readBulkMasterMeta(payment.rawCreateResponse)) return payment;
  const childMeta = readBulkChildMeta(payment.rawCreateResponse);
  if (!childMeta) return payment;
  const [master] = await db
    .select()
    .from(payments)
    .where(eq(payments.id, childMeta.masterPaymentId))
    .limit(1);
  return master ?? payment;
}

/**
 * If parcel is part of an in-flight bulk QR (master or child row), return the master payment.
 */
export async function findPendingBulkMasterForParcel(
  db: ReturnType<typeof getDb>,
  parcelId: string,
): Promise<PaymentRow | null> {
  const [pending] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.parcelId, parcelId), eq(payments.status, "pending")))
    .orderBy(desc(payments.createdAt))
    .limit(1);
  if (!pending) return null;

  const childMeta = readBulkChildMeta(pending.rawCreateResponse);
  if (childMeta) {
    const [master] = await db
      .select()
      .from(payments)
      .where(eq(payments.id, childMeta.masterPaymentId))
      .limit(1);
    if (
      master &&
      master.status === "pending" &&
      master.providerChargeId &&
      readBulkMasterMeta(master.rawCreateResponse)
    ) {
      return master;
    }
    return null;
  }

  if (pending.providerChargeId && readBulkMasterMeta(pending.rawCreateResponse)) {
    return pending;
  }

  return null;
}

export async function findPendingBulkMasterForUser(
  db: ReturnType<typeof getDb>,
  userId: string,
): Promise<PaymentRow | null> {
  const rows = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.userId, userId),
        eq(payments.status, "pending"),
        isNotNull(payments.providerChargeId),
        sql`${payments.rawCreateResponse} -> '_bulk' ->> 'kind' = 'bulk'`,
        sql`jsonb_typeof(${payments.rawCreateResponse} -> '_bulk' -> 'childPaymentIds') = 'array'`,
      ),
    )
    .orderBy(desc(payments.createdAt))
    .limit(1);
  const row = rows[0];
  if (!row || !readBulkMasterMeta(row.rawCreateResponse)) return null;
  return row;
}
