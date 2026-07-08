import { and, eq, inArray } from "drizzle-orm";
import { getDb, parcels, payments } from "@quickload/shared/db";
import {
  createBeamCharge,
  readBeamEnv,
  reconcilePendingPaymentFromBeamApi,
  isPaymentReconcileable,
} from "@quickload/shared/beam";
import { recordSystemErrorEvent } from "@quickload/shared/internal-events";
import {
  readBulkMasterMeta,
  withBulkChildMeta,
  withBulkMasterMeta,
} from "@quickload/shared/bulk-payment";
import {
  expireBulkPaymentGroup,
  findPendingBulkMasterForUser,
} from "@quickload/shared/bulk-payment-db";
import {
  DEFAULT_PAYMENT_METHOD_ID,
  getPaymentMethod,
  PROMPTPAY_METHOD_ID,
} from "@quickload/shared/payment-methods";
import { NextResponse } from "next/server";
import { loadOutstandingItemsForUser } from "@/lib/load-outstanding-items";
import { sendPaymentTerminalFlexIfSingle, sendBulkPaymentSuccessFlex } from "@/lib/payment-line-notify";
import { resolvePublicBaseUrl } from "@/lib/public-base-url";
import { requireLineSession } from "@/lib/require-user";

const QR_EXPIRY_MS = 10 * 60 * 1000;

type PaymentRow = typeof payments.$inferSelect;

type CreateBulkBody = {
  paymentMethod?: string;
};

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

function buildBulkChargeResponse(master: PaymentRow, items: Awaited<ReturnType<typeof loadOutstandingItemsForUser>>["items"]) {
  const bulkMeta = readBulkMasterMeta(master.rawCreateResponse);
  const totalAmount = bulkMeta?.totalCharged ?? master.amount;
  const itemCount = bulkMeta?.itemCount ?? items.length;
  return {
    paymentId: master.id,
    status: master.status,
    amount: totalAmount,
    currency: master.currency,
    paymentMethod: master.paymentMethod,
    redirectUrl: master.redirectUrl,
    actionRequired: master.redirectUrl
      ? "REDIRECT"
      : master.qrPayload
        ? "ENCODED_IMAGE"
        : "NONE",
    qrPayload: master.qrPayload,
    expiresAt: master.expiresAt?.toISOString() ?? null,
    paidAt: master.paidAt?.toISOString() ?? null,
    bulk: true as const,
    itemCount,
    items: items.map((item) => ({
      parcelId: item.parcelId,
      displayCode: item.displayCode,
      routeLabel: item.routeLabel,
      outstanding: item.outstanding,
    })),
  };
}

async function findPendingBulkMaster(userId: string): Promise<PaymentRow | null> {
  return findPendingBulkMasterForUser(getDb(), userId);
}

async function expireBulkGroup(master: PaymentRow): Promise<void> {
  await expireBulkPaymentGroup(getDb(), master);
}

async function reconcileBulkMaster(master: PaymentRow): Promise<PaymentRow> {
  if (!isPaymentReconcileable(master.status) || !master.providerChargeId) return master;
  const sync = await reconcilePendingPaymentFromBeamApi(master.providerChargeId);
  if (!sync.synced) return master;
  try {
    if (sync.outcome === "succeeded") {
      await sendBulkPaymentSuccessFlex(sync.paymentId);
    } else {
      await sendPaymentTerminalFlexIfSingle(sync.paymentId, sync.parcelId, sync.outcome);
    }
  } catch (lineErr) {
    const msg = lineErr instanceof Error ? lineErr.message : String(lineErr);
    console.warn("[payment.charges.bulk] line notify after beam reconcile:", msg);
  }
  const db = getDb();
  const [updated] = await db.select().from(payments).where(eq(payments.id, master.id)).limit(1);
  return updated ?? master;
}

export async function GET() {
  try {
    const session = await requireLineSession();
    const { items } = await loadOutstandingItemsForUser(session.userId);

    if (items.length === 0) {
      return NextResponse.json({ ok: true, data: { alreadyPaid: true } });
    }
    if (items.length === 1) {
      return NextResponse.json({
        ok: true,
        data: {
          singleParcel: true,
          parcelId: items[0].parcelId,
        },
      });
    }

    let master = await findPendingBulkMaster(session.userId);
    if (!master) {
      return NextResponse.json({ ok: true, data: { needsCharge: true, items } });
    }

    master = await reconcileBulkMaster(master);
    if (master.status === "succeeded") {
      return NextResponse.json({ ok: true, data: { alreadyPaid: true } });
    }

    let effectiveStatus = effectivePaymentStatus(master);
    if (effectiveStatus === "expired" && master.status === "pending") {
      await expireBulkGroup(master);
      return NextResponse.json({ ok: true, data: { needsCharge: true, items } });
    }

    if (effectiveStatus === "pending") {
      return NextResponse.json({
        ok: true,
        data: buildBulkChargeResponse(master, items),
      });
    }

    return NextResponse.json({ ok: true, data: { needsCharge: true, items } });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireLineSession();
    const body = (await request.json().catch(() => ({}))) as CreateBulkBody;
    const methodId = (body.paymentMethod ?? DEFAULT_PAYMENT_METHOD_ID).trim();
    const methodDef = getPaymentMethod(methodId);
    if (!methodDef) {
      return NextResponse.json({ ok: false, error: "Unsupported payment method" }, { status: 400 });
    }

    const { items, totalOutstanding } = await loadOutstandingItemsForUser(session.userId);
    if (items.length < 2) {
      return NextResponse.json(
        { ok: false, error: "Bulk payment requires at least 2 outstanding parcels" },
        { status: 400 },
      );
    }

    const db = getDb();
    const now = new Date();
    const parcelIds = items.map((item) => item.parcelId);

    const existingBulk = await findPendingBulkMaster(session.userId);
    if (existingBulk) {
      await expireBulkGroup(existingBulk);
    }

    await db
      .update(payments)
      .set({ status: "expired", updatedAt: now })
      .where(and(inArray(payments.parcelId, parcelIds), eq(payments.status, "pending")));

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
    const returnUrl = new URL("/pay/all", publicBaseUrl).toString();

    let beamResult;
    try {
      beamResult = await createBeamCharge({
        env,
        paymentMethodType: methodDef.beamType,
        amount: totalOutstanding.toFixed(2),
        currency: "THB",
        referenceId: idempotencyKey,
        idempotencyKey,
        returnUrl,
        expiryTime: ourExpiryDate.toISOString(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[payment.charges.bulk.create] Beam error:", msg);
      await recordSystemErrorEvent({
        source: "user.api.payment.charges.bulk.create.beam",
        error: err,
        context: {
          itemCount: items.length,
          paymentMethod: methodDef.id,
        },
      });
      return NextResponse.json({ ok: false, error: "Payment provider unavailable" }, { status: 502 });
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

    const [firstItem, ...restItems] = items;
    const [firstParcel] = await db
      .select()
      .from(parcels)
      .where(eq(parcels.id, firstItem.parcelId))
      .limit(1);
    if (!firstParcel || firstParcel.userId !== session.userId) {
      return NextResponse.json({ ok: false, error: "Parcel not found" }, { status: 404 });
    }

    for (const item of items) {
      const [parcel] = await db.select().from(parcels).where(eq(parcels.id, item.parcelId)).limit(1);
      if (parcel && !parcel.thaiPostPriceConfirmedAt) {
        return NextResponse.json(
          {
            ok: false,
            error: "One or more parcels are not price-confirmed yet (waiting for carrier webhook)",
          },
          { status: 409 },
        );
      }
    }

    const childPaymentIds: string[] = [];
    const bulkMeta = {
      kind: "bulk" as const,
      childPaymentIds,
      parcelIds,
      totalCharged: totalOutstanding.toFixed(2),
      itemCount: items.length,
    };

    const [master] = await db
      .insert(payments)
      .values({
        parcelId: firstParcel.id,
        userId: session.userId,
        provider: "beam",
        providerChargeId: beamResult.chargeId,
        amount: firstItem.outstanding.toFixed(2),
        currency: "THB",
        paymentMethod: methodDef.id,
        status: "pending",
        qrPayload: persistedQrPayload,
        redirectUrl: persistedRedirectUrl,
        expiresAt,
        rawCreateResponse: withBulkMasterMeta(beamResult.rawResponse, {
          ...bulkMeta,
          childPaymentIds: [],
        }) as any,
        idempotencyKey,
      })
      .returning();

    if (!master) {
      return NextResponse.json({ ok: false, error: "Failed to persist payment" }, { status: 500 });
    }

    for (const item of restItems) {
      const [child] = await db
        .insert(payments)
        .values({
          parcelId: item.parcelId,
          userId: session.userId,
          provider: "beam",
          amount: item.outstanding.toFixed(2),
          currency: "THB",
          paymentMethod: methodDef.id,
          status: "pending",
          rawCreateResponse: withBulkChildMeta({
            kind: "bulk",
            masterPaymentId: master.id,
          }) as any,
          idempotencyKey,
        })
        .returning();
      if (child) childPaymentIds.push(child.id);
    }

    if (childPaymentIds.length > 0) {
      await db
        .update(payments)
        .set({
          rawCreateResponse: withBulkMasterMeta(beamResult.rawResponse, {
            ...bulkMeta,
            childPaymentIds,
          }) as any,
          updatedAt: new Date(),
        })
        .where(eq(payments.id, master.id));
    }

    const [finalMaster] = await db.select().from(payments).where(eq(payments.id, master.id)).limit(1);
    if (!finalMaster) {
      return NextResponse.json({ ok: false, error: "Failed to load payment" }, { status: 500 });
    }

    console.info(
      `[payment.charges.bulk.create] paymentId=${finalMaster.id} parcels=${items.length} total=${totalOutstanding.toFixed(2)}`,
    );

    return NextResponse.json({
      ok: true,
      data: buildBulkChargeResponse(finalMaster, items),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    await recordSystemErrorEvent({
      source: "user.api.payment.charges.bulk",
      error: e,
    });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
