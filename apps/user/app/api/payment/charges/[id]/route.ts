import { eq } from "drizzle-orm";
import { reconcilePendingPaymentFromBeamApi, isPaymentReconcileable } from "@quickload/shared/beam";
import { readBulkMasterMeta } from "@quickload/shared/bulk-payment";
import { expireBulkPaymentGroup } from "@quickload/shared/bulk-payment-db";
import { getDb, parcels, payments } from "@quickload/shared/db";
import { recordSystemErrorEvent } from "@quickload/shared/internal-events";
import { computeOutstanding } from "@quickload/shared/penalty";
import { NextResponse } from "next/server";
import {
  sendPaymentTerminalFlexIfSingle,
  sendPaymentSuccessFlexForPayment,
  sendBulkPaymentSuccessFlex,
} from "@/lib/payment-line-notify";
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
    if (isPaymentReconcileable(paymentRow.status) && paymentRow.providerChargeId) {
      const sync = await reconcilePendingPaymentFromBeamApi(paymentRow.providerChargeId);
      if (sync.synced) {
        try {
          if (sync.outcome === "succeeded") {
            const bulkMeta = readBulkMasterMeta(paymentRow.rawCreateResponse);
            if (bulkMeta) {
              await sendBulkPaymentSuccessFlex(sync.paymentId);
            } else {
              await sendPaymentSuccessFlexForPayment(sync.paymentId, sync.parcelId);
            }
          } else {
            await sendPaymentTerminalFlexIfSingle(sync.paymentId, sync.parcelId, sync.outcome);
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
      const bulkMeta = readBulkMasterMeta(paymentRow.rawCreateResponse);
      if (bulkMeta) {
        await expireBulkPaymentGroup(db, paymentRow);
      } else {
        await db
          .update(payments)
          .set({ status: "expired", updatedAt: new Date() })
          .where(eq(payments.id, paymentRow.id));
      }
      effectiveStatus = "expired";
    }

    const out = computeOutstanding({
      price: parcelRow.price ?? "0",
      amountPaid: parcelRow.amountPaid,
    });

    const bulkMeta = readBulkMasterMeta(paymentRow.rawCreateResponse);
    const displayAmount = bulkMeta?.totalCharged ?? paymentRow.amount;

    return NextResponse.json({
      ok: true,
      data: {
        paymentId: paymentRow.id,
        status: effectiveStatus,
        amount: displayAmount,
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
        bulk: Boolean(bulkMeta),
        itemCount: bulkMeta?.itemCount ?? undefined,
        outstanding: bulkMeta
          ? {
              state: "unpaid" as const,
              totalOwed: Number(displayAmount),
              outstanding: Number(displayAmount),
            }
          : {
              state: out.state,
              totalOwed: out.totalOwed,
              outstanding: out.outstanding,
            },
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    await recordSystemErrorEvent({
      source: "user.api.payment.charges.get",
      error: e,
    });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
