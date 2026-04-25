import { eq } from "drizzle-orm";
import { getDb, parcels, payments } from "@quickload/shared/db";
import { markPaymentSucceeded } from "@quickload/shared/beam";
import { NextResponse } from "next/server";
import { requireLineSession } from "@/lib/require-user";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  // Hard 404 in prod builds — invisible, not just disabled.
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const session = await requireLineSession();
    const paymentId = params.id;
    const db = getDb();
    const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
    if (!payment || payment.status !== "pending" || !payment.providerChargeId) {
      return NextResponse.json({ ok: false, error: "Payment not pending" }, { status: 404 });
    }
    const [parcel] = await db
      .select()
      .from(parcels)
      .where(eq(parcels.id, payment.parcelId))
      .limit(1);
    if (!parcel || parcel.userId !== session.userId) {
      return NextResponse.json({ ok: false, error: "Payment not found" }, { status: 404 });
    }

    await markPaymentSucceeded({
      providerChargeId: payment.providerChargeId,
      rawWebhookPayload: { simulated: true, at: new Date().toISOString() },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
