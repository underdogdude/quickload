import { and, asc, desc, eq, inArray, isNotNull, notInArray } from "drizzle-orm";
import { getDb, orders, parcels, payments } from "@quickload/shared/db";
import { computeOutstanding } from "@quickload/shared/penalty";
import { NextResponse } from "next/server";
import { requireLineSession } from "@/lib/require-user";

/** Parcels eligible for the payment tab: unpaid, not canceled, ready to pay (has price & not waiting weight). */
const EXCLUDED_STATUSES = ["canceled", "awaiting_actual_weight", "draft"] as const;

function calculateInsuranceFee(productPrice: number): number {
  if (productPrice <= 2000) return 0;
  return Math.ceil(productPrice / 5000) * 10 + 25;
}

export async function GET() {
  try {
    const session = await requireLineSession();
    const db = getDb();

    const parcelRows = await db
      .select({
        id: parcels.id,
        trackingId: parcels.trackingId,
        barcode: parcels.barcode,
        destination: parcels.destination,
        status: parcels.status,
        price: parcels.price,
        isPaid: parcels.isPaid,
        penaltyClockStartedAt: parcels.penaltyClockStartedAt,
        amountPaid: parcels.amountPaid,
        createdAt: parcels.createdAt,
        updatedAt: parcels.updatedAt,
      })
      .from(parcels)
      .where(
        and(
          eq(parcels.userId, session.userId),
          eq(parcels.isPaid, false),
          isNotNull(parcels.thaiPostPriceConfirmedAt),
          notInArray(parcels.status, [...EXCLUDED_STATUSES]),
        ),
      )
      .orderBy(desc(parcels.createdAt));

    const parcelIds = parcelRows.map((p) => p.id);

    const firstPaidByParcel = new Map<string, Date>();
    if (parcelIds.length > 0) {
      const paidRows = await db
        .select({ parcelId: payments.parcelId, paidAt: payments.paidAt })
        .from(payments)
        .where(and(inArray(payments.parcelId, parcelIds), eq(payments.status, "succeeded")))
        .orderBy(asc(payments.paidAt));
      for (const row of paidRows) {
        if (row.paidAt && !firstPaidByParcel.has(row.parcelId)) {
          firstPaidByParcel.set(row.parcelId, row.paidAt);
        }
      }
    }

    const orderMap = new Map<
      string,
      {
        shipperProvince: string | null;
        cusProv: string | null;
        cost: string | null;
        finalcost: string | null;
        productPrice: string | null;
      }
    >();

    if (parcelIds.length > 0) {
      const orderRows = await db
        .select({
          parcelId: orders.parcelId,
          shipperProvince: orders.shipperProvince,
          cusProv: orders.cusProv,
          cost: orders.cost,
          finalcost: orders.finalcost,
          productPrice: orders.productPrice,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .where(inArray(orders.parcelId, parcelIds))
        .orderBy(desc(orders.createdAt));

      for (const row of orderRows) {
        if (!orderMap.has(row.parcelId)) {
          orderMap.set(row.parcelId, {
            shipperProvince: row.shipperProvince,
            cusProv: row.cusProv,
            cost: row.cost != null ? String(row.cost) : null,
            finalcost: row.finalcost != null ? String(row.finalcost) : null,
            productPrice: row.productPrice,
          });
        }
      }
    }

    const now = new Date();
    type Item = {
      parcelId: string;
      displayCode: string;
      routeLabel: string;
      outstanding: number;
      shippingFee: number;
      smsFee: number;
      insuranceFee: number;
      status: string;
      updatedAt: string | null;
    };

    const items: Item[] = [];
    let totalOutstanding = 0;
    let latestTouch: Date | null = null;

    for (const p of parcelRows) {
      const priceStr = p.price != null ? String(p.price) : "0";
      if (!p.price || Number(priceStr) <= 0) continue;

      let out;
      try {
        out = computeOutstanding({
          price: priceStr,
          penaltyClockStartedAt: p.penaltyClockStartedAt,
          amountPaid: String(p.amountPaid ?? "0"),
          firstSuccessfulPaymentAt: firstPaidByParcel.get(p.id) ?? null,
          now,
        });
      } catch {
        continue;
      }

      if (out.state === "settled" || out.state === "abandoned") continue;
      if (out.outstanding <= 0) continue;

      const ord = orderMap.get(p.id);
      const declaredValue = Number(ord?.productPrice ?? 0);
      const insuranceFee = calculateInsuranceFee(Number.isFinite(declaredValue) ? declaredValue : 0);
      const smsFee = 0;
      const shippingFee = Math.max(0, out.outstanding - insuranceFee - smsFee);

      const sender = ord?.shipperProvince?.trim() || "—";
      const dest = ord?.cusProv?.trim() || p.destination?.split("·")[1]?.trim() || "—";
      const displayCode = p.barcode?.trim() || p.trackingId;

      const touch = p.updatedAt ?? p.createdAt;
      if (touch && (!latestTouch || touch > latestTouch)) latestTouch = touch;

      items.push({
        parcelId: p.id,
        displayCode,
        routeLabel: `${sender} → ${dest}`,
        outstanding: out.outstanding,
        shippingFee,
        smsFee,
        insuranceFee,
        status: p.status,
        updatedAt: p.updatedAt?.toISOString() ?? null,
      });

      totalOutstanding += out.outstanding;
    }

    return NextResponse.json({
      ok: true,
      data: {
        totalOutstanding,
        itemCount: items.length,
        updatedAt: latestTouch?.toISOString() ?? now.toISOString(),
        items,
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
