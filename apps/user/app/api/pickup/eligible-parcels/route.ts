import {
  getDb,
  ishipPickupRequestParcels,
  ishipPickupRequests,
  orders,
  parcels,
} from "@quickload/shared/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { CacheHeaders } from "@/lib/api-cache";
import { BLOCKING_ISHIP_PICKUP_STATUSES } from "@/lib/iship-pickup";
import { requireLineSession } from "@/lib/require-user";

function text(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

export async function GET() {
  try {
    const session = await requireLineSession();
    const db = getDb();
    const rows = await db
      .select({
        id: parcels.id,
        trackingId: parcels.trackingId,
        barcode: parcels.barcode,
        weightKg: parcels.weightKg,
        createdAt: parcels.createdAt,
        recipientName: orders.cusName,
        recipientPhone: orders.cusTel,
        recipientAddress: orders.cusAdd,
        recipientTambon: orders.cusSub,
        recipientAmphoe: orders.cusAmp,
        recipientProvince: orders.cusProv,
        recipientZipcode: orders.cusZipcode,
        orderCreatedAt: orders.createdAt,
      })
      .from(parcels)
      .innerJoin(orders, eq(orders.parcelId, parcels.id))
      .where(and(eq(parcels.userId, session.userId), eq(parcels.status, "awaiting_actual_weight")))
      .orderBy(desc(parcels.createdAt), desc(orders.createdAt));

    const latestByParcel = new Map<string, (typeof rows)[number]>();
    for (const row of rows) if (!latestByParcel.has(row.id)) latestByParcel.set(row.id, row);
    const parcelIds = [...latestByParcel.keys()];
    const activeRows = parcelIds.length
      ? await db
          .select({
            parcelId: ishipPickupRequestParcels.parcelId,
            status: ishipPickupRequests.status,
          })
          .from(ishipPickupRequestParcels)
          .innerJoin(
            ishipPickupRequests,
            eq(ishipPickupRequests.id, ishipPickupRequestParcels.pickupRequestId),
          )
          .where(
            and(
              inArray(ishipPickupRequestParcels.parcelId, parcelIds),
              inArray(ishipPickupRequests.status, BLOCKING_ISHIP_PICKUP_STATUSES),
            ),
          )
      : [];
    const activeIds = new Set(activeRows.map((row) => row.parcelId));
    const activePickupIds = new Set(
      activeRows
        .filter((row) => row.status !== "picked_up")
        .map((row) => row.parcelId),
    );

    const items = [...latestByParcel.values()].flatMap((row) => {
      if (activeIds.has(row.id)) return [];
      const weightKg = Number(row.weightKg);
      if (!Number.isFinite(weightKg) || weightKg <= 0) {
        return [];
      }
      const recipientAddress = [
        text(row.recipientAddress),
        text(row.recipientTambon),
        text(row.recipientAmphoe),
        text(row.recipientProvince),
        text(row.recipientZipcode),
      ]
        .filter(Boolean)
        .join(" ");
      return [
        {
          id: row.id,
          trackingId: row.trackingId,
          barcode: row.barcode,
          displayCode: row.barcode?.trim() || row.trackingId,
          weightKg,
          recipient: {
            contactName: text(row.recipientName) ?? "-",
            phone: text(row.recipientPhone) ?? "-",
            addressShort: recipientAddress || "-",
          },
          createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
        },
      ];
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          items,
          activePickupParcelCount: activePickupIds.size,
          unavailablePickupParcelCount: activeIds.size,
        },
      },
      { headers: CacheHeaders.noStore },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "โหลดพัสดุไม่สำเร็จ";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: CacheHeaders.noStore },
    );
  }
}
