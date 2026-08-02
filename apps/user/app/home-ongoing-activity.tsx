import {
  getDb,
  ishipPickupRequestParcels,
  ishipPickupRequests,
  parcels,
} from "@quickload/shared/db";
import { and, desc, eq, inArray, notExists } from "drizzle-orm";
import {
  buildParcelOngoingActivity,
  buildPickupOngoingActivity,
  selectRecentOngoingActivities,
  type OngoingActivity,
} from "@/lib/home-ongoing-activity";
import { HomeOngoingCarousel } from "./home-ongoing-carousel";

const ACTIVE_PICKUP_STATUSES = [
  "submitting",
  "requested",
  "assigned",
  "unknown",
] as const;

const ACTIVE_PARCEL_STATUSES = [
  "awaiting_actual_weight",
  "pending_payment",
  "registered",
  "paid",
  "in_transit",
  "at_destination_post",
  "returning",
] as const;

const MAX_ONGOING_ITEMS = 6;

async function loadOngoingActivities(userId: string): Promise<OngoingActivity[]> {
  try {
    const db = getDb();
    const [pickupRows, parcelRows] = await Promise.all([
      db
        .select({
          id: ishipPickupRequests.id,
          createdAt: ishipPickupRequests.createdAt,
          status: ishipPickupRequests.status,
          ticketPickupId: ishipPickupRequests.ishipTicketPickupId,
          parcelCount: ishipPickupRequests.parcelCount,
        })
        .from(ishipPickupRequests)
        .where(
          and(
            eq(ishipPickupRequests.userId, userId),
            inArray(ishipPickupRequests.status, [...ACTIVE_PICKUP_STATUSES]),
          ),
        )
        .orderBy(desc(ishipPickupRequests.createdAt))
        .limit(MAX_ONGOING_ITEMS),
      db
        .select({
          id: parcels.id,
          createdAt: parcels.createdAt,
          status: parcels.status,
          trackingId: parcels.trackingId,
          barcode: parcels.barcode,
          price: parcels.price,
          amountPaid: parcels.amountPaid,
        })
        .from(parcels)
        .where(
          and(
            eq(parcels.userId, userId),
            inArray(parcels.status, [...ACTIVE_PARCEL_STATUSES]),
            notExists(
              db
                .select({ parcelId: ishipPickupRequestParcels.parcelId })
                .from(ishipPickupRequestParcels)
                .innerJoin(
                  ishipPickupRequests,
                  eq(
                    ishipPickupRequests.id,
                    ishipPickupRequestParcels.pickupRequestId,
                  ),
                )
                .where(
                  and(
                    eq(ishipPickupRequestParcels.parcelId, parcels.id),
                    inArray(ishipPickupRequests.status, [
                      ...ACTIVE_PICKUP_STATUSES,
                      "picked_up",
                    ]),
                  ),
                ),
            ),
          ),
        )
        .orderBy(desc(parcels.createdAt))
        .limit(MAX_ONGOING_ITEMS),
    ]);

    return selectRecentOngoingActivities([
      ...pickupRows.map((pickup) =>
        buildPickupOngoingActivity({
          ...pickup,
          createdAt: pickup.createdAt.toISOString(),
        }),
      ),
      ...parcelRows.map((parcel) =>
        buildParcelOngoingActivity({
          ...parcel,
          createdAt: parcel.createdAt.toISOString(),
        }),
      ),
    ]);
  } catch {
    // Home remains fully usable when activity data is temporarily unavailable.
    return [];
  }
}

export async function HomeOngoingActivity({ userId }: { userId: string | null }) {
  if (!userId) return null;
  const activities = await loadOngoingActivities(userId);
  if (!activities.length) return null;

  return (
    <section
      className="mx-auto mt-4 max-w-lg"
      aria-labelledby="home-ongoing-heading"
      data-testid="home-ongoing-activity"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id="home-ongoing-heading" className="text-base font-medium text-slate-900">
          กำลังดำเนินการ
        </h2>
        <span className="text-xs font-medium text-slate-500 tabular-nums">
          {activities.length.toLocaleString("th-TH")} รายการ
        </span>
      </div>

      <HomeOngoingCarousel activities={activities} />
    </section>
  );
}
