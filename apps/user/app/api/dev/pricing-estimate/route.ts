import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb, orders, parcels, thaiPostWebhookEvents } from "@quickload/shared/db";
import { loadDevMockPayload } from "@/lib/dev-mock/load-payload";
import { createPaymentDueFlexMessage } from "@/lib/line-flex";
import { pushLineMessage } from "@/lib/line-messaging";
import { requireLineSession } from "@/lib/require-user";

const PRICING_KEY = "pricing_estimate_mock";

type PricingMockPayload = {
  estimatedTotal?: unknown;
  estimatedTotalMin?: unknown;
  estimatedTotalMax?: unknown;
};

/** Fixed number, or `"random"` with optional min/max (defaults 0..1000 inclusive). */
function resolvePricingMockEstimatedTotal(payload: PricingMockPayload): number | null {
  const raw = payload.estimatedTotal;
  const isRandom =
    raw === "random" || (typeof raw === "string" && raw.trim().toLowerCase() === "random");
  if (isRandom) {
    const minRaw = Number(payload.estimatedTotalMin);
    const maxRaw = Number(payload.estimatedTotalMax);
    const lo = Number.isFinite(minRaw) ? Math.max(0, Math.floor(minRaw)) : 0;
    const hi = Number.isFinite(maxRaw) ? Math.floor(maxRaw) : 1000;
    if (hi < lo) return null;
    return lo + Math.floor(Math.random() * (hi - lo + 1));
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function smartpostMockEnabled() {
  return process.env.NEXT_PUBLIC_SMARTPOST_MOCK === "1";
}

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

export async function GET() {
  if (!smartpostMockEnabled()) {
    return NextResponse.json({ ok: false, error: "Pricing DB mock is disabled" }, { status: 403 });
  }
  try {
    const payload = loadDevMockPayload(PRICING_KEY);
    if (payload == null || typeof payload !== "object" || !("estimatedTotal" in (payload as object))) {
      return NextResponse.json(
        {
          ok: false,
          error: `Missing mock payload "${PRICING_KEY}.json" under apps/user/lib/dev-mock/payloads/`,
        },
        { status: 503 },
      );
    }
    const estimatedTotal = resolvePricingMockEstimatedTotal(payload as PricingMockPayload);
    if (estimatedTotal == null || estimatedTotal < 0) {
      return NextResponse.json({ ok: false, error: "Invalid estimatedTotal in pricing mock JSON" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, data: { estimatedTotal } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

type SimulateBody = {
  parcelId?: string;
  estimatedTotal?: number;
};

export async function POST(request: Request) {
  if (!smartpostMockEnabled()) {
    return NextResponse.json({ ok: false, error: "Pricing DB mock is disabled" }, { status: 403 });
  }
  try {
    const session = await requireLineSession();
    const body = (await request.json().catch(() => ({}))) as SimulateBody;
    const parcelId = body.parcelId?.trim();
    if (!parcelId) {
      return NextResponse.json({ ok: false, error: "parcelId required" }, { status: 400 });
    }

    let estimatedTotal = Number(body.estimatedTotal);
    const fromBody = Number.isFinite(estimatedTotal) && estimatedTotal > 0;
    if (!fromBody) {
      const payload = loadDevMockPayload(PRICING_KEY);
      if (payload == null || typeof payload !== "object" || !("estimatedTotal" in (payload as object))) {
        return NextResponse.json(
          { ok: false, error: `Missing mock payload "${PRICING_KEY}.json" under apps/user/lib/dev-mock/payloads/` },
          { status: 503 },
        );
      }
      const resolved = resolvePricingMockEstimatedTotal(payload as PricingMockPayload);
      if (resolved == null || resolved < 0) {
        return NextResponse.json({ ok: false, error: "Invalid estimatedTotal in pricing mock JSON" }, { status: 500 });
      }
      estimatedTotal = resolved;
    }
    if (!Number.isFinite(estimatedTotal) || estimatedTotal < 0) {
      return NextResponse.json({ ok: false, error: "Invalid estimatedTotal" }, { status: 500 });
    }

    const db = getDb();
    const publicBaseUrl = resolvePublicBaseUrl(request);
    const [target] = await db
      .select({
        id: parcels.id,
        barcode: parcels.barcode,
        status: parcels.status,
        isPaid: parcels.isPaid,
      })
      .from(parcels)
      .where(and(eq(parcels.id, parcelId), eq(parcels.userId, session.userId)))
      .limit(1);

    if (!target) {
      return NextResponse.json({ ok: false, error: "Parcel not found" }, { status: 404 });
    }
    if (target.status !== "awaiting_actual_weight") {
      return NextResponse.json({ ok: false, error: "Parcel is not awaiting actual weight" }, { status: 409 });
    }
    if (target.isPaid) {
      return NextResponse.json({ ok: false, error: "Parcel already paid" }, { status: 409 });
    }

    const now = new Date();
    const fixedPrice = estimatedTotal.toFixed(2);
    const barcode = target.barcode?.trim() || "";
    const statusDateRaw = now.toISOString();
    const historyEntry = {
      id: randomUUID(),
      barcode,
      status: "1",
      statusDescription: "ปณ.ต้นทางรับฝากแล้ว",
      statusDate: statusDateRaw,
      station: "DEV_MOCK",
      createdAt: statusDateRaw,
    };

    await db.transaction(async (tx) => {
      await tx
        .update(parcels)
        .set({
          status: "pending_payment",
          price: fixedPrice,
          thaiPostPriceConfirmedAt: now,
          updatedAt: now,
        })
        .where(and(eq(parcels.id, target.id), eq(parcels.userId, session.userId)));

      await tx
        .insert(thaiPostWebhookEvents)
        .values({
          parcelId: target.id,
          barcode: barcode || target.id,
          statusCode: "1",
          statusDescription: "ปณ.ต้นทางรับฝากแล้ว",
          statusDateRaw,
          station: "DEV_MOCK",
          statusHistory: [historyEntry],
          rawPayload: {
            devMock: true,
            source: "pricing-estimate",
            estimatedTotal: fixedPrice,
          },
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: thaiPostWebhookEvents.parcelId,
          set: {
            barcode: barcode || thaiPostWebhookEvents.barcode,
            statusCode: "1",
            statusDescription: "ปณ.ต้นทางรับฝากแล้ว",
            statusDateRaw,
            station: "DEV_MOCK",
            statusHistory: sql`(
              CASE
                WHEN jsonb_typeof(${thaiPostWebhookEvents.statusHistory}) = 'array'
                THEN ${thaiPostWebhookEvents.statusHistory}
                ELSE '[]'::jsonb
              END || ${JSON.stringify([historyEntry])}::jsonb
            )`,
            rawPayload: {
              devMock: true,
              source: "pricing-estimate",
              estimatedTotal: fixedPrice,
            },
            updatedAt: now,
          },
        });

      await tx
        .update(orders)
        .set({
          finalcost: fixedPrice,
          orderStatus: "1:ปณ.ต้นทางรับฝากแล้ว",
          updatedAt: now,
        })
        .where(eq(orders.parcelId, target.id));
    });

    const readBack = async () => {
      const [row] = await db
        .select({
          status: parcels.status,
          price: parcels.price,
          thaiPostPriceConfirmedAt: parcels.thaiPostPriceConfirmedAt,
        })
        .from(parcels)
        .where(and(eq(parcels.id, target.id), eq(parcels.userId, session.userId)))
        .limit(1);
      return row;
    };

    let after = await readBack();
    if (after?.status !== "pending_payment") {
      await db
        .update(parcels)
        .set({
          status: "pending_payment",
          price: fixedPrice,
          thaiPostPriceConfirmedAt: now,
          updatedAt: now,
        })
        .where(and(eq(parcels.id, target.id), eq(parcels.userId, session.userId)));
      after = await readBack();
    }

    if (!after || after.status !== "pending_payment") {
      return NextResponse.json(
        {
          ok: false,
          error: "status_not_updated",
          debug: {
            expected: "pending_payment",
            actual: after?.status ?? null,
            parcelId: target.id,
          },
        },
        { status: 500 },
      );
    }

    if (publicBaseUrl) {
      try {
        const payUrl = new URL(`/pay/${encodeURIComponent(target.id)}`, publicBaseUrl).toString();
        const flex = createPaymentDueFlexMessage({
          parcelId: target.id,
          trackingNumber: barcode || target.id,
          amountBaht: fixedPrice,
          payUrl,
        });
        await pushLineMessage({
          to: session.lineUserId,
          message: flex,
        });
      } catch (lineErr) {
        const msg = lineErr instanceof Error ? lineErr.message : String(lineErr);
        console.warn("[line-flex] dev pricing-estimate send failed:", msg);
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        parcelId: target.id,
        status: after.status,
        price: after.price == null ? fixedPrice : String(after.price),
        thaiPostPriceConfirmedAt:
          after.thaiPostPriceConfirmedAt instanceof Date
            ? after.thaiPostPriceConfirmedAt.toISOString()
            : after.thaiPostPriceConfirmedAt
              ? String(after.thaiPostPriceConfirmedAt)
              : statusDateRaw,
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
