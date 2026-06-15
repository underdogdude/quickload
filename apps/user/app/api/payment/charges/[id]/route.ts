import { eq } from "drizzle-orm";
import { reconcilePendingPaymentFromBeamApi } from "@quickload/shared/beam";
import { getDb, parcels, payments } from "@quickload/shared/db";
import { computeOutstanding } from "@quickload/shared/penalty";
import { NextResponse } from "next/server";
import { sendPaymentFailedFlexForPayment, sendPaymentSuccessFlexForPayment } from "@/lib/payment-line-notify";
import { requireLineSession } from "@/lib/require-user";

export async function GET(
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
    const [parcel] = await db
      .select()
      .from(parcels)
      .where(eq(parcels.id, payment.parcelId))
      .limit(1);
    if (!parcel || parcel.userId !== session.userId) {
      return NextResponse.json({ ok: false, error: "Payment not found" }, { status: 404 });
    }

    let paymentRow = payment;
    let parcelRow = parcel;

    // Beam public webhook docs only guarantee charge.succeeded; failed PromptPay often
    // finalizes at Beam without a webhook → poll GET charge here while UI polls us.
    if (paymentRow.status === "pending" && paymentRow.providerChargeId) {
      const sync = await reconcilePendingPaymentFromBeamApi(paymentRow.providerChargeId);
      if (sync.synced) {
        try {
          if (sync.outcome === "succeeded") {
            await sendPaymentSuccessFlexForPayment(sync.paymentId, sync.parcelId);
          } else {
            await sendPaymentFailedFlexForPayment(sync.paymentId, sync.parcelId, sync.outcome);
          }
        } catch (lineErr) {
          const msg = lineErr instanceof Error ? lineErr.message : String(lineErr);
          console.warn("[payment.charges.get] line notify after beam reconcile:", msg);
        }
        const [p2] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
        if (p2) paymentRow = p2;
        const [c2] = await db.select().from(parcels).where(eq(parcels.id, parcelRow.id)).limit(1);
        if (c2) parcelRow = c2;
      }
    }

    // Flip to expired lazily.
    let effectiveStatus = paymentRow.status;
    if (
      paymentRow.status === "pending" &&
      paymentRow.expiresAt &&
      paymentRow.expiresAt.getTime() < Date.now()
    ) {
      await db
        .update(payments)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(payments.id, paymentRow.id));
      effectiveStatus = "expired";
    }

    const out = computeOutstanding({
      price: parcelRow.price ?? "0",
      amountPaid: parcelRow.amountPaid,
    });

    return NextResponse.json({
      ok: true,
      data: {
        paymentId: paymentRow.id,
        status: effectiveStatus,
        amount: paymentRow.amount,
        currency: paymentRow.currency,
        paymentMethod: paymentRow.paymentMethod,
        redirectUrl: paymentRow.redirectUrl,
        actionRequired: paymentRow.redirectUrl ? "REDIRECT" : paymentRow.qrPayload ? "ENCODED_IMAGE" : "NONE",
        qrPayload: paymentRow.qrPayload,
        expiresAt: paymentRow.expiresAt?.toISOString() ?? null,
        paidAt: paymentRow.paidAt?.toISOString() ?? null,
        parcelId: parcelRow.id,
        barcode: parcelRow.barcode,
        trackingId: parcelRow.trackingId,
        outstanding: {
          state: out.state,
          totalOwed: out.totalOwed,
          outstanding: out.outstanding,
        },
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
