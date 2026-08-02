import {
  getDb,
  ishipPickupRequests,
  parcels,
  payments,
} from "@quickload/shared/db";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { loadOutstandingItemsForUser } from "@/lib/load-outstanding-items";
import { EXCLUDED_PROFILE_PICKUP_STATUSES } from "@/lib/profile-dashboard";
import { requireLineSession } from "@/lib/require-user";

function countValue(rows: Array<{ value: number | string }>): number {
  return Number(rows[0]?.value ?? 0);
}

export async function GET() {
  try {
    const session = await requireLineSession();
    const db = getDb();

    const [parcelRows, pickupRows, succeededRows, outstanding] = await Promise.all([
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(parcels)
        .where(eq(parcels.userId, session.userId)),
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(ishipPickupRequests)
        .where(
          and(
            eq(ishipPickupRequests.userId, session.userId),
            notInArray(ishipPickupRequests.status, [...EXCLUDED_PROFILE_PICKUP_STATUSES]),
          ),
        ),
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(payments)
        .innerJoin(parcels, eq(payments.parcelId, parcels.id))
        .where(
          and(
            eq(parcels.userId, session.userId),
            eq(payments.status, "succeeded"),
          ),
        ),
      loadOutstandingItemsForUser(session.userId),
    ]);

    return NextResponse.json({
      ok: true,
      data: {
        parcelsTotal: countValue(parcelRows),
        pickupRequests: countValue(pickupRows),
        paymentsSucceeded: countValue(succeededRows),
        paymentsPending: outstanding.items.length,
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
