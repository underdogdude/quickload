import { and, eq, gt } from "drizzle-orm";
import { getDb, parcels, payments } from "@quickload/shared/db";
import { createBeamPromptPayCharge, readBeamEnv } from "@quickload/shared/beam";
import { NextResponse } from "next/server";
import { requireLineSession } from "@/lib/require-user";

const QR_EXPIRY_MS = 10 * 60 * 1000;

type CreateChargeBody = { parcelId?: string };

export async function POST(request: Request) {
  try {
    const session = await requireLineSession();
    const body = (await request.json().catch(() => ({}))) as CreateChargeBody;
    const parcelId = body.parcelId?.trim();
    if (!parcelId) {
      return NextResponse.json({ ok: false, error: "parcelId required" }, { status: 400 });
    }

    const db = getDb();
    const [parcel] = await db.select().from(parcels).where(eq(parcels.id, parcelId)).limit(1);
    if (!parcel || parcel.userId !== session.userId) {
      // 404 to avoid leaking existence.
      return NextResponse.json({ ok: false, error: "Parcel not found" }, { status: 404 });
    }
    if (parcel.isPaid) {
      return NextResponse.json({ ok: false, error: "Parcel already paid" }, { status: 400 });
    }
    if (!parcel.price || Number(parcel.price) <= 0) {
      return NextResponse.json({ ok: false, error: "Parcel has no price" }, { status: 400 });
    }

    // Step 3: resume existing non-expired pending.
    const now = new Date();
    const existing = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.parcelId, parcelId),
          eq(payments.status, "pending"),
          gt(payments.expiresAt, now),
        ),
      )
      .limit(1);
    if (existing[0]) {
      const p = existing[0];
      return NextResponse.json({
        ok: true,
        data: {
          paymentId: p.id,
          amount: p.amount,
          currency: p.currency,
          qrPayload: p.qrPayload,
          expiresAt: p.expiresAt?.toISOString() ?? null,
          status: p.status,
        },
      });
    }

    // Step 4: expire stale pending rows for this parcel.
    await db
      .update(payments)
      .set({ status: "expired", updatedAt: now })
      .where(and(eq(payments.parcelId, parcelId), eq(payments.status, "pending")));

    // Step 5-7: call Beam, insert row.
    const idempotencyKey = crypto.randomUUID();
    const env = readBeamEnv();
    let beamResult;
    try {
      beamResult = await createBeamPromptPayCharge({
        env,
        amount: parcel.price,
        currency: "THB",
        referenceId: parcel.id,
        idempotencyKey,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[payment.charges.create] Beam error:", msg);
      return NextResponse.json(
        { ok: false, error: "Payment provider unavailable" },
        { status: 502 },
      );
    }

    const ourExpiry = new Date(now.getTime() + QR_EXPIRY_MS);
    const beamExpiry = beamResult.expiresAt ? new Date(beamResult.expiresAt) : null;
    const expiresAt =
      beamExpiry && !isNaN(beamExpiry.getTime()) && beamExpiry < ourExpiry ? beamExpiry : ourExpiry;

    const [inserted] = await db
      .insert(payments)
      .values({
        parcelId: parcel.id,
        userId: parcel.userId,
        provider: "beam",
        providerChargeId: beamResult.chargeId,
        amount: parcel.price,
        currency: "THB",
        paymentMethod: "promptpay",
        status: "pending",
        qrPayload: beamResult.qrPayload,
        expiresAt,
        rawCreateResponse: beamResult.rawResponse as any,
        idempotencyKey,
      })
      .returning();

    if (!inserted) {
      return NextResponse.json({ ok: false, error: "Failed to persist payment" }, { status: 500 });
    }

    console.info(
      `[payment.charges.create] paymentId=${inserted.id} parcelId=${parcel.id} amount=${parcel.price}`,
    );

    return NextResponse.json({
      ok: true,
      data: {
        paymentId: inserted.id,
        amount: inserted.amount,
        currency: inserted.currency,
        qrPayload: inserted.qrPayload,
        expiresAt: inserted.expiresAt?.toISOString() ?? null,
        status: inserted.status,
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
