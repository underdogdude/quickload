import { and, asc, eq } from "drizzle-orm";
import { getDb, parcels, payments } from "@quickload/shared/db";
import { computeOutstanding } from "@quickload/shared/penalty";
import { NextResponse } from "next/server";
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

    // Flip to expired lazily.
    let effectiveStatus = payment.status;
    if (
      payment.status === "pending" &&
      payment.expiresAt &&
      payment.expiresAt.getTime() < Date.now()
    ) {
      await db
        .update(payments)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(payments.id, payment.id));
      effectiveStatus = "expired";
    }

    const [firstPayment] = await db
      .select({ paidAt: payments.paidAt })
      .from(payments)
      .where(and(eq(payments.parcelId, parcel.id), eq(payments.status, "succeeded")))
      .orderBy(asc(payments.paidAt))
      .limit(1);

    const out = computeOutstanding({
      price: parcel.price ?? "0",
      penaltyClockStartedAt: parcel.penaltyClockStartedAt,
      amountPaid: parcel.amountPaid,
      firstSuccessfulPaymentAt: firstPayment?.paidAt ?? null,
      now: new Date(),
    });

    return NextResponse.json({
      ok: true,
      data: {
        paymentId: payment.id,
        status: effectiveStatus,
        amount: payment.amount,
        currency: payment.currency,
        qrPayload: payment.qrPayload,
        expiresAt: payment.expiresAt?.toISOString() ?? null,
        paidAt: payment.paidAt?.toISOString() ?? null,
        parcelId: parcel.id,
        trackingId: parcel.trackingId,
        outstanding: {
          state: out.state,
          totalOwed: out.totalOwed,
          outstanding: out.outstanding,
          currentTier: out.currentTier,
          nextTier: out.nextTier,
          nextTierAt: out.nextTierAt?.toISOString() ?? null,
          abandonAt: out.abandonAt?.toISOString() ?? null,
          frozen: out.frozen,
        },
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
