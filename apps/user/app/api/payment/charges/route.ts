import { and, desc, eq, gt } from "drizzle-orm";
import { readBulkMasterMeta } from "@quickload/shared/bulk-payment";
import {
  expireBulkPaymentGroup,
  findPendingBulkMasterForParcel,
} from "@quickload/shared/bulk-payment-db";
import { getDb, parcels, payments } from "@quickload/shared/db";
import {
  createBeamCharge,
  readBeamEnv,
  reconcilePendingPaymentFromBeamApi,
} from "@quickload/shared/beam";
import {
  DEFAULT_PAYMENT_METHOD_ID,
  getPaymentMethod,
  PROMPTPAY_METHOD_ID,
} from "@quickload/shared/payment-methods";
import { computeOutstanding } from "@quickload/shared/penalty";
import { NextResponse } from "next/server";
import { sendPaymentTerminalFlexIfSingle, sendPaymentSuccessFlexForPayment, sendBulkPaymentSuccessFlex } from "@/lib/payment-line-notify";
import { resolvePublicBaseUrl } from "@/lib/public-base-url";
import { requireLineSession } from "@/lib/require-user";

const QR_EXPIRY_MS = 10 * 60 * 1000;

type CreateChargeBody = {
  parcelId?: string;
  paymentMethod?: string;
};

type ParcelRow = typeof parcels.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;

function buildChargeData(parcelRow: ParcelRow, paymentRow: PaymentRow, effectiveStatus: string) {
  const out = computeOutstanding({
    price: parcelRow.price ?? "0",
    amountPaid: parcelRow.amountPaid,
  });
  return {
    paymentId: paymentRow.id,
    status: effectiveStatus,
    amount: paymentRow.amount,
    currency: paymentRow.currency,
    paymentMethod: paymentRow.paymentMethod,
    redirectUrl: paymentRow.redirectUrl,
    actionRequired: paymentRow.redirectUrl
      ? "REDIRECT"
      : paymentRow.qrPayload
        ? "ENCODED_IMAGE"
        : "NONE",
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
  };
}

async function reconcilePaymentRow(paymentRow: PaymentRow): Promise<{
  paymentRow: PaymentRow;
  parcelRow: ParcelRow | null;
}> {
  const db = getDb();
  let row = paymentRow;
  if (row.status === "pending" && row.providerChargeId) {
    const sync = await reconcilePendingPaymentFromBeamApi(row.providerChargeId);
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
        console.warn("[payment.charges] line notify after beam reconcile:", msg);
      }
      const [p2] = await db.select().from(payments).where(eq(payments.id, row.id)).limit(1);
      if (p2) row = p2;
    }
  }
  const [parcelRow] = await db.select().from(parcels).where(eq(parcels.id, row.parcelId)).limit(1);
  return { paymentRow: row, parcelRow: parcelRow ?? null };
}

function effectivePaymentStatus(paymentRow: PaymentRow): string {
  if (
    paymentRow.status === "pending" &&
    paymentRow.expiresAt &&
    paymentRow.expiresAt.getTime() < Date.now()
  ) {
    return "expired";
  }
  return paymentRow.status;
}

/**
 * Resume an in-flight payment without creating a new charge.
 * Used when returning from Beam bank apps — must reconcile before rotating to PromptPay.
 */
export async function GET(request: Request) {
  try {
    const session = await requireLineSession();
    const parcelId = new URL(request.url).searchParams.get("parcelId")?.trim() ?? "";
    if (!parcelId) {
      return NextResponse.json({ ok: false, error: "parcelId required" }, { status: 400 });
    }

    const db = getDb();
    const [parcel] = await db.select().from(parcels).where(eq(parcels.id, parcelId)).limit(1);
    if (!parcel || parcel.userId !== session.userId) {
      return NextResponse.json({ ok: false, error: "Parcel not found" }, { status: 404 });
    }

    const out = computeOutstanding({
      price: parcel.price ?? "0",
      amountPaid: parcel.amountPaid,
    });
    if (parcel.isPaid || out.state === "settled") {
      return NextResponse.json({
        ok: true,
        data: {
          alreadyPaid: true,
          parcelId: parcel.id,
          trackingId: parcel.trackingId,
          barcode: parcel.barcode,
        },
      });
    }

    const bulkMaster = await findPendingBulkMasterForParcel(db, parcelId);
    if (bulkMaster) {
      return NextResponse.json({
        ok: true,
        data: { bulkPayAll: true as const, paymentId: bulkMaster.id },
      });
    }

    const [pending] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.parcelId, parcelId), eq(payments.status, "pending")))
      .orderBy(desc(payments.createdAt))
      .limit(1);

    if (!pending) {
      return NextResponse.json({ ok: true, data: { needsCharge: true } });
    }

    const reconciled = await reconcilePaymentRow(pending);
    if (!reconciled.parcelRow) {
      return NextResponse.json({ ok: false, error: "Parcel not found" }, { status: 404 });
    }

    let paymentRow = reconciled.paymentRow;
    let parcelRow = reconciled.parcelRow;

    if (paymentRow.status === "succeeded" || parcelRow.isPaid) {
      return NextResponse.json({
        ok: true,
        data: buildChargeData(parcelRow, paymentRow, "succeeded"),
      });
    }

    let effectiveStatus = effectivePaymentStatus(paymentRow);
    if (effectiveStatus === "expired" && paymentRow.status === "pending") {
      await db
        .update(payments)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(payments.id, paymentRow.id));
      paymentRow = { ...paymentRow, status: "expired" };
    }

    if (effectiveStatus === "pending") {
      return NextResponse.json({
        ok: true,
        data: buildChargeData(parcelRow, paymentRow, effectiveStatus),
      });
    }

    return NextResponse.json({ ok: true, data: { needsCharge: true } });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

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
    const bulkMaster = await findPendingBulkMasterForParcel(db, parcelId);
    if (bulkMaster) {
      await expireBulkPaymentGroup(db, bulkMaster);
    }

    // Step 4: expire any existing pending rows for this parcel.
    await db
      .update(payments)
      .set({ status: "expired", updatedAt: now })
      .where(and(eq(payments.parcelId, parcelId), eq(payments.status, "pending")));

    // Step 5-7: call Beam, insert row.
    const idempotencyKey = crypto.randomUUID();
    const env = readBeamEnv();
    const ourExpiryDate = new Date(now.getTime() + QR_EXPIRY_MS);

    const publicBaseUrl = resolvePublicBaseUrl(request);
    if (!publicBaseUrl) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "ไม่พบ public URL สำหรับกลับจาก Beam กรุณาตั้ง NEXT_PUBLIC_APP_URL เป็น URL tunnel (เช่น trycloudflare.com)",
        },
        { status: 503 },
      );
    }
    const returnUrl = new URL(`/pay/${encodeURIComponent(parcel.id)}`, publicBaseUrl).toString();

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
