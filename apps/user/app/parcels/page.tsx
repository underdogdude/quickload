import { redirect } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { thaiPostEventsForApiFromHistory } from "@quickload/shared/thai-post-webhook-history";
import { getDb, orders, parcels, thaiPostWebhookEvents } from "@quickload/shared/db";
import { getCurrentUser } from "@/lib/current-user";
import { ParcelsListClient } from "./parcels-list-client";

type ParcelRow = {
  id: string;
  trackingId: string;
  barcode: string | null;
  status: string;
  destination: string | null;
  price: string | null;
  amountPaid: string | null;
  isPaid: boolean;
  /** ISO timestamp when Thailand Post webhook set final billable price. */
  thaiPostPriceConfirmedAt: string | null;
  createdAt: string;
  senderProvince: string | null;
  senderName: string | null;
  senderPhone: string | null;
  recipientProvince: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  /** Thailand Post webhook rows for this parcel (oldest → newest). */
  thaiPostEvents: Array<{
    id: string;
    statusCode: string;
    description: string | null;
    statusDateRaw: string | null;
    station?: string | null;
    barcode?: string | null;
    createdAt: string;
  }>;
};

async function loadParcels(
  userId: string,
): Promise<{ items: ParcelRow[]; error: string | null }> {
  try {
    const db = getDb();
    const parcelRows = await db
      .select({
        id: parcels.id,
        trackingId: parcels.trackingId,
        barcode: parcels.barcode,
        status: parcels.status,
        destination: parcels.destination,
        price: parcels.price,
        amountPaid: parcels.amountPaid,
        isPaid: parcels.isPaid,
        thaiPostPriceConfirmedAt: parcels.thaiPostPriceConfirmedAt,
        createdAt: parcels.createdAt,
      })
      .from(parcels)
      .where(eq(parcels.userId, userId))
      .orderBy(desc(parcels.createdAt));

    const parcelIds = parcelRows.map((row) => row.id);
    const orderMap = new Map<
      string,
      {
        senderProvince: string | null;
        senderName: string | null;
        senderPhone: string | null;
        recipientProvince: string | null;
        recipientName: string | null;
        recipientPhone: string | null;
      }
    >();
    if (parcelIds.length > 0) {
      const orderRows = await db
        .select({
          parcelId: orders.parcelId,
          senderProvince: orders.shipperProvince,
          senderName: orders.shipperName,
          senderPhone: orders.shipperMobile,
          recipientProvince: orders.cusProv,
          recipientName: orders.cusName,
          recipientPhone: orders.cusTel,
        })
        .from(orders)
        .where(inArray(orders.parcelId, parcelIds))
        .orderBy(desc(orders.createdAt));

      for (const row of orderRows) {
        if (!orderMap.has(row.parcelId)) {
          orderMap.set(row.parcelId, {
            senderProvince: row.senderProvince,
            senderName: row.senderName,
            senderPhone: row.senderPhone,
            recipientProvince: row.recipientProvince,
            recipientName: row.recipientName,
            recipientPhone: row.recipientPhone,
          });
        }
      }
    }

    const thaiPostByParcel = new Map<string, ParcelRow["thaiPostEvents"]>();
    if (parcelIds.length > 0) {
      try {
        const evRows = await db
          .select({
            parcelId: thaiPostWebhookEvents.parcelId,
            statusHistory: thaiPostWebhookEvents.statusHistory,
          })
          .from(thaiPostWebhookEvents)
          .where(inArray(thaiPostWebhookEvents.parcelId, parcelIds));

        for (const row of evRows) {
          thaiPostByParcel.set(row.parcelId, thaiPostEventsForApiFromHistory(row.statusHistory));
        }
      } catch (e) {
        console.error(
          "[parcels.page] thai_post_webhook_events query failed (run packages/shared: pnpm db:apply:thai-post-webhook if column status_history is missing):",
          e,
        );
      }
    }

    const items: ParcelRow[] = parcelRows.map((r) => ({
      id: r.id,
      trackingId: r.trackingId,
      barcode: r.barcode,
      status: r.status,
      destination: r.destination,
      price: r.price == null ? null : String(r.price),
      amountPaid: r.amountPaid == null ? null : String(r.amountPaid),
      isPaid: r.isPaid,
      thaiPostPriceConfirmedAt:
        r.thaiPostPriceConfirmedAt instanceof Date
          ? r.thaiPostPriceConfirmedAt.toISOString()
          : r.thaiPostPriceConfirmedAt
            ? String(r.thaiPostPriceConfirmedAt)
            : null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      senderProvince: orderMap.get(r.id)?.senderProvince ?? null,
      senderName: orderMap.get(r.id)?.senderName ?? null,
      senderPhone: orderMap.get(r.id)?.senderPhone ?? null,
      recipientProvince: orderMap.get(r.id)?.recipientProvince ?? null,
      recipientName: orderMap.get(r.id)?.recipientName ?? null,
      recipientPhone: orderMap.get(r.id)?.recipientPhone ?? null,
      thaiPostEvents: thaiPostByParcel.get(r.id) ?? [],
    }));
    return { items, error: null };
  } catch (e) {
    console.error("[parcels.page] loadParcels failed:", e);
    return { items: [], error: "โหลดรายการพัสดุไม่สำเร็จ" };
  }
}

export default async function ParcelsPage({
  searchParams,
}: {
  searchParams?: { q?: string | string[] };
}) {
  const user = await getCurrentUser();
  if (!user.loggedIn || !user.userId) {
    redirect("/entry");
  }

  const qRaw = searchParams?.q;
  const initialQuery = typeof qRaw === "string" ? qRaw : Array.isArray(qRaw) ? (qRaw[0] ?? "") : "";
  const { items, error } = await loadParcels(user.userId);

  return (
    <main className="min-h-screen bg-slate-100 pb-28">
      <section className="bg-[#2726F5] px-6 pb-14 pt-10 text-white">
        <div className="mx-auto w-full max-w-lg">
          <h1 className="text-3xl font-bold leading-none">พัสดุของฉัน</h1>
          <p className="mt-1 text-sm text-white/80">ติดตามสถานะและจัดการคำสั่งซื้อของคุณ</p>
        </div>
      </section>

      <section className="-mt-8 px-6">
        <ParcelsListClient items={items} error={error} initialQuery={initialQuery} />
      </section>
    </main>
  );
}
