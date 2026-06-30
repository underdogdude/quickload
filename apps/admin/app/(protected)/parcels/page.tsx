import { PageHeader, PaymentPill, PrimaryLink, StatusPill, formatDateTime, formatMoney } from "@/app/admin-ui";
import { getDb } from "@quickload/shared/db";
import { orders, parcels, users } from "@quickload/shared/db/schema";
import { desc, eq, ilike, or, sql } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

const statuses = [
  { value: "", label: "All statuses" },
  { value: "awaiting_actual_weight", label: "Awaiting price" },
  { value: "pending_payment", label: "Payment due" },
  { value: "registered", label: "Registered" },
  { value: "in_transit", label: "In transit" },
  { value: "delivered", label: "Delivered" },
  { value: "failed", label: "Failed" },
  { value: "canceled", label: "Canceled" },
];

export default async function AdminParcelsPage({
  searchParams,
}: {
  searchParams?: { q?: string; status?: string };
}) {
  const q = searchParams?.q?.trim() ?? "";
  const selectedStatus = searchParams?.status?.trim() ?? "";
  const db = getDb();
  const search = q ? `%${q}%` : "";

  const rows = await db
    .select({
      id: parcels.id,
      trackingId: parcels.trackingId,
      barcode: parcels.barcode,
      status: parcels.status,
      destination: parcels.destination,
      price: parcels.price,
      amountPaid: parcels.amountPaid,
      isPaid: parcels.isPaid,
      createdAt: parcels.createdAt,
      updatedAt: parcels.updatedAt,
      customerName: users.displayName,
      customerPhone: users.phone,
      recipientName: orders.cusName,
      recipientPhone: orders.cusTel,
    })
    .from(parcels)
    .leftJoin(users, eq(parcels.userId, users.id))
    .leftJoin(orders, eq(orders.parcelId, parcels.id))
    .where(
      q && selectedStatus
        ? sql`${parcels.status} = ${selectedStatus} and (${parcels.trackingId} ilike ${search} or ${parcels.barcode} ilike ${search} or ${parcels.destination} ilike ${search} or ${users.displayName} ilike ${search} or ${users.phone} ilike ${search} or ${orders.cusName} ilike ${search} or ${orders.cusTel} ilike ${search})`
        : q
          ? or(
              ilike(parcels.trackingId, search),
              ilike(parcels.barcode, search),
              ilike(parcels.destination, search),
              ilike(users.displayName, search),
              ilike(users.phone, search),
              ilike(orders.cusName, search),
              ilike(orders.cusTel, search),
            )
          : selectedStatus
            ? eq(parcels.status, selectedStatus)
            : undefined,
    )
    .orderBy(desc(sql`coalesce(${parcels.updatedAt}, ${parcels.createdAt})`))
    .limit(200);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Parcels"
        description="Search production parcel records by tracking id, barcode, customer, recipient, phone, or destination."
        action={<PrimaryLink href="/parcels/new">New parcel</PrimaryLink>}
      />

      <form className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-[1fr_220px_auto]">
        <label className="block text-sm font-medium text-slate-700">
          Search
          <input
            name="q"
            defaultValue={q}
            className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500"
            placeholder="Tracking, barcode, name, phone"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Status
          <select
            name="status"
            defaultValue={selectedStatus}
            className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500"
          >
            {statuses.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button type="submit" className="h-10 w-full rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 md:w-auto">
            Apply
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3 text-sm text-slate-600">
          Showing <span className="font-medium text-slate-950">{rows.length}</span> parcel records
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-4 py-3">Parcel</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Updated</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/parcels/${row.id}`} className="font-mono text-sm font-semibold text-slate-950 hover:text-emerald-800">
                      {row.barcode ?? row.trackingId}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500">{row.barcode ? row.trackingId : row.destination ?? "No destination"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{row.customerName ?? row.recipientName ?? "Unknown"}</p>
                    <p className="mt-1 text-xs text-slate-500">{row.customerPhone ?? row.recipientPhone ?? row.destination ?? "No contact detail"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <StatusPill status={row.status} />
                      <PaymentPill isPaid={row.isPaid} price={row.price} amountPaid={row.amountPaid} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">{formatMoney(row.price)}</td>
                  <td className="px-4 py-3 text-right text-xs text-slate-500">{formatDateTime(row.updatedAt ?? row.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/parcels/${row.id}`} className="text-sm font-medium text-emerald-700 hover:text-emerald-900">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? (
          <div className="border-t border-slate-100 px-4 py-10 text-center text-sm text-slate-600">
            No parcels match the current filters.
          </div>
        ) : null}
      </div>
    </div>
  );
}
