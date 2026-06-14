import { and, eq, gt } from "drizzle-orm";
import { getDb, parcels, payments } from "@quickload/shared/db";
import { createBeamPromptPayCharge, readBeamEnv } from "@quickload/shared/beam";
import { computeOutstanding } from "@quickload/shared/penalty";
import { resolveParcelDisplayCode } from "@quickload/shared/parcel-display-code";
import { NextResponse } from "next/server";
import { createPaymentQrFlexMessage } from "@/lib/line-flex";
import { pushLineMessage } from "@/lib/line-messaging";
import { requireLineSession } from "@/lib/require-user";

const QR_EXPIRY_MS = 10 * 60 * 1000;

type CreateChargeBody = { parcelId?: string };

function resolvePublicBaseUrl(request: Request): string | null {
  const envBase =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_BASE_URL?.trim() ||
    process.env.PUBLIC_BASE_URL?.trim() ||
    "";
  if (envBase) return envBase.replace(/\/+$/, "");

  const forwardedProto = request.headers.get("x-forwarded-proto")?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.trim();
  if (forwardedProto && forwardedHost && !/^(0\.0\.0\.0|localhost)(:\d+)?$/i.test(forwardedHost)) {
    return `${forwardedProto}://${forwardedHost}`.replace(/\/+$/, "");
  }

  try {
    const origin = new URL(request.url).origin;
    const host = new URL(origin).host;
    if (/^(0\.0\.0\.0|localhost)(:\d+)?$/i.test(host)) return null;
    return origin.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function toPublicQrImageUrl(
  paymentId: string,
  qrPayload: string | null | undefined,
  baseUrl: string | null,
): string | null {
  if (!baseUrl || !qrPayload?.trim()) return null;
  return new URL(`/api/payment/charges/${encodeURIComponent(paymentId)}/qr.png`, baseUrl).toString();
}

async function canFetchPublicImage(url: string | null): Promise<boolean> {
  if (!url) return false;
  try {
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

function minutesUntil(expiresAt: Date | null | undefined, now: Date): number {
  if (!expiresAt) return 1;
  const ms = expiresAt.getTime() - now.getTime();
  return Math.max(1, Math.ceil(ms / 60000));
}

export async function POST(request: Request) {
  try {
    const session = await requireLineSession();
    const body = (await request.json().catch(() => ({}))) as CreateChargeBody;
    const parcelId = body.parcelId?.trim();
    if (!parcelId) {
      return NextResponse.json({ ok: false, error: "parcelId required" }, { status: 400 });
    }

    const db = getDb();
    const publicBaseUrl = resolvePublicBaseUrl(request);
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
      beamResult = await createBeamPromptPayCharge({
        env,
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
          paymentMethod: "promptpay",
          status: "pending",
          qrPayload: beamResult.qrPayload,
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
              qrPayload: survivor.qrPayload,
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

    try {
      const base = publicBaseUrl;
      const qrCodeImageUrl = base ? toPublicQrImageUrl(inserted.id, inserted.qrPayload, base) : null;
      const qrOk = await canFetchPublicImage(qrCodeImageUrl);

      console.info(
        `[payment.charges.flex] paymentId=${inserted.id} qr=${qrOk} base=${base ?? "null"}`,
      );

      const flex = createPaymentQrFlexMessage({
        trackingNumber: resolveParcelDisplayCode({
          barcode: parcel.barcode,
          trackingId: parcel.trackingId,
        }),
        amountBaht: inserted.amount,
        expiresInMinutes: minutesUntil(inserted.expiresAt, now),
        qrCodeImageUrl: qrOk ? qrCodeImageUrl : null,
        payUrl: base ? new URL(`/pay/${encodeURIComponent(parcel.id)}`, base).toString() : null,
      });
      await pushLineMessage({
        to: session.lineUserId,
        message: flex,
      });
    } catch (lineErr) {
      const msg = lineErr instanceof Error ? lineErr.message : String(lineErr);
      console.warn("[line-flex] payment qr send failed (new):", msg);
    }

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
