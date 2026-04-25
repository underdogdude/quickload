import { and, eq } from "drizzle-orm";
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
    const [parcel] = await db
      .select()
      .from(parcels)
      .where(eq(parcels.id, payment.parcelId))
      .limit(1);
    if (!parcel || parcel.userId !== session.userId) {
      return NextResponse.json({ ok: false, error: "Payment not found" }, { status: 404 });
    }

    await db
      .update(payments)
      .set({ status: "canceled", updatedAt: new Date() })
      .where(and(eq(payments.id, paymentId), eq(payments.status, "pending")));

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
