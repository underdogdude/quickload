import { and, eq, isNotNull, lte, notInArray } from "drizzle-orm";
import { getDb, notificationLog, parcels, payments } from "@quickload/shared/db";
import { ABANDON_AFTER_MINUTES } from "@quickload/shared/penalty";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("[sweep-abandoned] CRON_SECRET is not set");
    return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
  }
  const presented = request.headers.get("x-cron-token");
  if (presented !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const sweptAt = new Date();
  const cutoff = new Date(sweptAt.getTime() - ABANDON_AFTER_MINUTES * 60_000);

  // Atomic: cancel parcels whose clock started before cutoff AND have no payment yet.
  // The amount_paid filter is re-checked at row-write time so a payment landing
  // mid-sweep does not get its parcel canceled.
  const canceled = await db
    .update(parcels)
    .set({ status: "canceled", updatedAt: sweptAt })
    .where(
      and(
        isNotNull(parcels.penaltyClockStartedAt),
        lte(parcels.penaltyClockStartedAt, cutoff),
        eq(parcels.amountPaid, "0"),
        notInArray(parcels.status, ["paid", "canceled"]),
      ),
    )
    .returning({
      parcelId: parcels.id,
      trackingId: parcels.trackingId,
      priceBaseTHB: parcels.price,
      penaltyClockStartedAt: parcels.penaltyClockStartedAt,
    });

  // Expire any pending payments rows for the canceled parcels and log notifications.
  for (const row of canceled) {
    await db
      .update(payments)
      .set({ status: "expired", updatedAt: sweptAt })
      .where(and(eq(payments.parcelId, row.parcelId), eq(payments.status, "pending")));

    await db.insert(notificationLog).values({
      lineUserId: "system",
      type: "parcel_auto_canceled",
      payload: {
        parcelId: row.parcelId,
        trackingId: row.trackingId,
        priceBaseTHB: row.priceBaseTHB,
        penaltyClockStartedAt: row.penaltyClockStartedAt?.toISOString() ?? null,
        sweptAt: sweptAt.toISOString(),
      },
      status: "queued",
    });
  }

  console.info(`[sweep-abandoned] sweptAt=${sweptAt.toISOString()} canceled=${canceled.length}`);

  return NextResponse.json({
    ok: true,
    sweptAt: sweptAt.toISOString(),
    canceledCount: canceled.length,
    canceled: canceled.map((c) => ({
      parcelId: c.parcelId,
      trackingId: c.trackingId,
      priceBaseTHB: c.priceBaseTHB,
      penaltyClockStartedAt: c.penaltyClockStartedAt?.toISOString() ?? null,
    })),
  });
}
