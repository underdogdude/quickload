import { and, desc, eq, inArray, isNotNull, notInArray } from "drizzle-orm";
import { getDb, orders, parcels } from "@quickload/shared/db";
import { computeOutstanding } from "@quickload/shared/penalty";
import { resolveParcelDisplayCode } from "@quickload/shared/parcel-display-code";

const EXCLUDED_STATUSES = ["canceled", "awaiting_actual_weight", "draft", "registered"] as const;

function calculateInsuranceFee(productPrice: number): number {
  if (productPrice <= 2000) return 0;
  return Math.ceil(productPrice / 5000) * 10 + 25;
}

export type OutstandingParcelItem = {
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

export async function loadOutstandingItemsForUser(userId: string): Promise<{
  items: OutstandingParcelItem[];
  totalOutstanding: number;
  updatedAt: string;
}> {
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
      amountPaid: parcels.amountPaid,
      createdAt: parcels.createdAt,
      updatedAt: parcels.updatedAt,
    })
    .from(parcels)
    .where(
      and(
        eq(parcels.userId, userId),
        eq(parcels.isPaid, false),
        isNotNull(parcels.price),
        notInArray(parcels.status, [...EXCLUDED_STATUSES]),
      ),
    )
    .orderBy(desc(parcels.createdAt));

  const parcelIds = parcelRows.map((p) => p.id);
  const orderMap = new Map<
    string,
    {
      shipperProvince: string | null;
      cusProv: string | null;
      productPrice: string | null;
      smartpostTrackingcode: string | null;
    }
  >();

  if (parcelIds.length > 0) {
    const orderRows = await db
      .select({
        parcelId: orders.parcelId,
        shipperProvince: orders.shipperProvince,
        cusProv: orders.cusProv,
        productPrice: orders.productPrice,
        smartpostTrackingcode: orders.smartpostTrackingcode,
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
          productPrice: row.productPrice,
          smartpostTrackingcode: row.smartpostTrackingcode,
        });
      }
    }
  }

  const now = new Date();
  const items: OutstandingParcelItem[] = [];
  let totalOutstanding = 0;
  let latestTouch: Date | null = null;

  for (const p of parcelRows) {
    const priceStr = p.price != null ? String(p.price) : "0";
    if (!p.price || Number(priceStr) <= 0) continue;

    let out;
    try {
      out = computeOutstanding({
        price: priceStr,
        amountPaid: String(p.amountPaid ?? "0"),
      });
    } catch {
      continue;
    }

    if (out.state === "settled" || out.outstanding <= 0) continue;

    const ord = orderMap.get(p.id);
    const declaredValue = Number(ord?.productPrice ?? 0);
    const insuranceFee = calculateInsuranceFee(Number.isFinite(declaredValue) ? declaredValue : 0);
    const smsFee = 0;
    const shippingFee = Math.max(0, out.outstanding - insuranceFee - smsFee);

    const sender = ord?.shipperProvince?.trim() || "—";
    const dest = ord?.cusProv?.trim() || p.destination?.split("·")[1]?.trim() || "—";
    const displayCode = resolveParcelDisplayCode({
      barcode: p.barcode,
      smartpostTrackingcode: ord?.smartpostTrackingcode,
      trackingId: p.trackingId,
    });

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

  return {
    items,
    totalOutstanding,
    updatedAt: latestTouch?.toISOString() ?? now.toISOString(),
  };
}
