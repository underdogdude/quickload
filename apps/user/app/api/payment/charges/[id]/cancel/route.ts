import { and, eq, inArray } from "drizzle-orm";
import { readBulkMasterMeta } from "@quickload/shared/bulk-payment";
import { resolveBulkMasterPayment } from "@quickload/shared/bulk-payment-db";
import { getDb, parcels, payments } from "@quickload/shared/db";
import { NextResponse } from "next/server";
import { requireLineSession } from "@/lib/require-user";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const session = await requireLineSession();
    const paymentId = params.id;
    const db = getDb();
    const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
    if (!payment) {
      return NextResponse.json({ ok: false, error: "Payment not found" }, { status: 404 });
    }
    const masterPayment = await resolveBulkMasterPayment(db, payment);
    const [parcel] = await db
      .select()
      .from(parcels)
      .where(eq(parcels.id, payment.parcelId))
      .limit(1);
    if (!parcel || parcel.userId !== session.userId) {
      return NextResponse.json({ ok: false, error: "Payment not found" }, { status: 404 });
    }

    const bulkMeta = readBulkMasterMeta(masterPayment.rawCreateResponse);
    const result = await db.transaction(async (tx) => {
      const now = new Date();
      if (bulkMeta) {
        await tx
          .update(payments)
          .set({ status: "canceled", updatedAt: now })
          .where(
            and(
              inArray(payments.id, [masterPayment.id, ...bulkMeta.childPaymentIds]),
              eq(payments.status, "pending"),
            ),
          );
        return { parcelCanceled: false };
      }

      await tx
        .update(payments)
        .set({ status: "canceled", updatedAt: new Date() })
        .where(and(eq(payments.id, payment.id), eq(payments.status, "pending")));

      const parcelCancelable = Number(parcel.amountPaid ?? "0") <= 0;
      if (parcelCancelable) {
        await tx
          .update(parcels)
          .set({ status: "canceled", updatedAt: new Date() })
          .where(and(eq(parcels.id, parcel.id), eq(parcels.amountPaid, "0")));
      }
      return { parcelCanceled: parcelCancelable };
    });

    return NextResponse.json({ ok: true, parcelCanceled: result.parcelCanceled });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
