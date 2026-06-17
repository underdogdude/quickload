import { and, eq, gt } from "drizzle-orm";
import { getDb, parcels, payments } from "@quickload/shared/db";
import { createBeamCharge, readBeamEnv } from "@quickload/shared/beam";
import {
  DEFAULT_PAYMENT_METHOD_ID,
  getPaymentMethod,
  PROMPTPAY_METHOD_ID,
} from "@quickload/shared/payment-methods";
import { computeOutstanding } from "@quickload/shared/penalty";
import { NextResponse } from "next/server";
import { requireLineSession } from "@/lib/require-user";

const QR_EXPIRY_MS = 10 * 60 * 1000;

type CreateChargeBody = {
  parcelId?: string;
  paymentMethod?: string;
};

export async function POST(request: Request) {
  try {
    const session = await requireLineSession();
    const body = (await request.json().catch(() => ({}))) as CreateChargeBody;
    const parcelId = body.parcelId?.trim();
    if (!parcelId) {
      return NextResponse.json({ ok: false, error: "parcelId required" }, { status: 400 });
    }

    const methodId = (body.paymentMethod ?? DEFAULT_PAYMENT_METHOD_ID).trim();
    const methodDef = getPaymentMethod(methodId);
    if (!methodDef) {
      return NextResponse.json(
        { ok: false, error: "Unsupported payment method" },
        { status: 400 },
      );
    }

    const db = getDb();
    const [parcel] = await db.select().from(parcels).where(eq(parcels.id, parcelId)).limit(1);
    if (!parcel || parcel.userId !== session.userId) {
      // 404 to avoid leaking existence.
      return NextResponse.json({ ok: false, error: "Parcel not found" }, { status: 404 });
    }
    if (parcel.status === "awaiting_actual_weight") {
      return NextResponse.json(
        { ok: false, error: "Parcel is not ready for payment yet (waiting for actual weight)" },
        { status: 409 },
      );
    }
    if (!parcel.price || Number(parcel.price) <= 0) {
      return NextResponse.json({ ok: false, error: "Parcel has no price" }, { status: 400 });
    }
    if (!parcel.thaiPostPriceConfirmedAt) {
      // Smartpost cron webhooks omit finalcost, so thaiPostPriceConfirmedAt may never have been
      // set even though we have a valid price. Confirm it now so payment can proceed.
      await db
        .update(parcels)
        .set({ thaiPostPriceConfirmedAt: new Date(), updatedAt: new Date() })
        .where(eq(parcels.id, parcelId));
    }

    const out = computeOutstanding({
      price: parcel.price,
      amountPaid: parcel.amountPaid,
    });

    if (out.state === "settled") {
      return NextResponse.json({ ok: false, error: "Parcel already paid" }, { status: 400 });
    }

    // Step 3: always rotate to a fresh charge.
    // Reusing old pending rows can surface stale QR that Beam already finalized.
    const now = new Date();
    // Step 4: expire any existing pending rows for this parcel.
    await db
      .update(payments)
      .set({ status: "expired", updatedAt: now })
      .where(and(eq(payments.parcelId, parcelId), eq(payments.status, "pending")));

    // Step 5-7: call Beam, insert row.
    const idempotencyKey = crypto.randomUUID();
    const env = readBeamEnv();
    const ourExpiryDate = new Date(now.getTime() + QR_EXPIRY_MS);
    const returnUrl = new URL(`/pay/${parcel.id}`, request.url).toString();
    let beamResult;
    try {
      beamResult = await createBeamCharge({
        env,
        paymentMethodType: methodDef.beamType,
        amount: out.outstanding.toFixed(2),
        currency: "THB",
        referenceId: parcel.id,
        idempotencyKey,
        returnUrl,
        expiryTime: ourExpiryDate.toISOString(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[payment.charges.create] Beam error:", msg);
      return NextResponse.json(
        { ok: false, error: "Payment provider unavailable" },
        { status: 502 },
      );
    }

    const beamExpiry = beamResult.expiresAt ? new Date(beamResult.expiresAt) : null;
    const expiresAt =
      beamExpiry && !Number.isNaN(beamExpiry.getTime()) && beamExpiry < ourExpiryDate
        ? beamExpiry
        : ourExpiryDate;
    const persistedQrPayload =
      methodDef.id === PROMPTPAY_METHOD_ID ? beamResult.qrPayload : null;
    const persistedRedirectUrl =
      methodDef.id === PROMPTPAY_METHOD_ID ? null : beamResult.redirectUrl;
    const actionRequired = beamResult.actionRequired;

    let inserted;
    try {
      [inserted] = await db
        .insert(payments)
        .values({
          parcelId: parcel.id,
          userId: parcel.userId,
          provider: "beam",
          providerChargeId: beamResult.chargeId,
          amount: out.outstanding.toFixed(2),
          currency: "THB",
          paymentMethod: methodDef.id,
          status: "pending",
          qrPayload: persistedQrPayload,
          redirectUrl: persistedRedirectUrl,
          expiresAt,
          rawCreateResponse: beamResult.rawResponse as any,
          idempotencyKey,
        })
        .returning();
    } catch (err) {
      // Partial unique index payments_one_pending_per_parcel_idx blocks
      // concurrent inserts (e.g. React-StrictMode double-mount race). Recover
      // by returning the surviving pending row instead of erroring.
      const code = (err as { code?: string } | null)?.code;
      if (code === "23505") {
        const [survivor] = await db
          .select()
          .from(payments)
          .where(
            and(
              eq(payments.parcelId, parcel.id),
              eq(payments.status, "pending"),
              gt(payments.expiresAt, now),
            ),
          )
          .limit(1);
        if (survivor) {
          console.info(
            `[payment.charges.create] race recovered: returning existing pending paymentId=${survivor.id} parcelId=${parcel.id}`,
          );
          return NextResponse.json({
            ok: true,
            data: {
              paymentId: survivor.id,
              amount: survivor.amount,
              currency: survivor.currency,
              paymentMethod: survivor.paymentMethod,
              qrPayload: survivor.qrPayload,
              redirectUrl: survivor.redirectUrl,
              actionRequired:
                survivor.redirectUrl ? "REDIRECT" : survivor.qrPayload ? "ENCODED_IMAGE" : "NONE",
              expiresAt: survivor.expiresAt?.toISOString() ?? null,
              status: survivor.status,
            },
          });
        }
      }
      throw err;
    }

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
        paymentMethod: inserted.paymentMethod,
        qrPayload: inserted.qrPayload,
        redirectUrl: inserted.redirectUrl,
        actionRequired:
          inserted.redirectUrl ? "REDIRECT" : inserted.qrPayload ? "ENCODED_IMAGE" : actionRequired,
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
