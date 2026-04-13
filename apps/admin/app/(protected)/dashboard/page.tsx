import { parcels, pickupRequests } from "@quickload/shared/db/schema";
import { getDb } from "@quickload/shared/db";
import { count, eq } from "drizzle-orm";

export default async function DashboardPage() {
  const db = getDb();
  const [parcelRow] = await db.select({ value: count() }).from(parcels);
  const [pendingPickups] = await db
    .select({ value: count() })
    .from(pickupRequests)
    .where(eq(pickupRequests.status, "pending"));

  return (
    <main>
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded border border-slate-200 bg-white p-4">
          <div className="text-sm text-slate-600">Parcels</div>
          <div className="mt-1 text-2xl font-semibold">{parcelRow?.value ?? 0}</div>
        </div>
        <div className="rounded border border-slate-200 bg-white p-4">
          <div className="text-sm text-slate-600">Pending pickups</div>
          <div className="mt-1 text-2xl font-semibold">{pendingPickups?.value ?? 0}</div>
        </div>
      </div>
    </main>
  );
}
