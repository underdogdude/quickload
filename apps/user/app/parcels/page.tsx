import { redirect } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb, orders, parcels } from "@quickload/shared/db";
import { getCurrentUser } from "@/lib/current-user";
import { ParcelsListClient } from "./parcels-list-client";

type ParcelRow = {
  id: string;
  trackingId: string;
  barcode: string | null;
  status: string;
  destination: string | null;
  isPaid: boolean;
  createdAt: string;
  senderProvince: string | null;
  senderName: string | null;
  senderPhone: string | null;
  recipientProvince: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
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
        isPaid: parcels.isPaid,
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

    const items: ParcelRow[] = parcelRows.map((r) => ({
      id: r.id,
      trackingId: r.trackingId,
      barcode: r.barcode,
      status: r.status,
      destination: r.destination,
      isPaid: r.isPaid,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      senderProvince: orderMap.get(r.id)?.senderProvince ?? null,
      senderName: orderMap.get(r.id)?.senderName ?? null,
      senderPhone: orderMap.get(r.id)?.senderPhone ?? null,
      recipientProvince: orderMap.get(r.id)?.recipientProvince ?? null,
      recipientName: orderMap.get(r.id)?.recipientName ?? null,
      recipientPhone: orderMap.get(r.id)?.recipientPhone ?? null,
    }));
    return { items, error: null };
  } catch {
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
