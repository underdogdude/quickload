"use client";

import { PaymentPill, StatusPill, formatDateTime, formatMoney } from "@/app/admin-ui";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const statuses = ["awaiting_actual_weight", "pending_payment", "registered", "in_transit", "delivered", "failed", "canceled"] as const;

type ParcelRecord = {
  id: string;
  trackingId: string;
  barcode: string | null;
  destination: string | null;
  weightKg: string | null;
  size: string | null;
  parcelType: string | null;
  note: string | null;
  status: string;
  price: string | null;
  amountPaid: string;
  isPaid: boolean;
  source: string;
  thaiPostPriceConfirmedAt: string | null;
  penaltyClockStartedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-b border-slate-100 py-3 last:border-b-0">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-slate-950">{value || "-"}</dd>
    </div>
  );
}

export default function AdminParcelDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const [parcel, setParcel] = useState<ParcelRecord | null>(null);
  const [status, setStatus] = useState<string>("registered");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/parcels/${id}`);
      const json = (await res.json()) as { ok?: boolean; data?: ParcelRecord; error?: string };
      if (cancelled) return;
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Failed to load parcel");
        return;
      }
      setParcel(json.data ?? null);
      if (json.data?.status) setStatus(json.data.status);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/parcels/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string; data?: ParcelRecord };
    setSaving(false);
    if (!res.ok || !json.ok) {
      setError(json.error ?? "Failed to save status");
      return;
    }
    setParcel(json.data ?? null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/parcels" className="text-sm font-medium text-emerald-700 hover:text-emerald-900">
            Back to parcels
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-normal text-slate-950">
            {parcel?.barcode ?? parcel?.trackingId ?? "Parcel"}
          </h1>
          <p className="mt-2 text-sm text-slate-600">{parcel?.trackingId ?? id}</p>
        </div>
        {parcel ? (
          <div className="flex flex-wrap gap-2">
            <StatusPill status={parcel.status} />
            <PaymentPill isPaid={parcel.isPaid} price={parcel.price} amountPaid={parcel.amountPaid} />
          </div>
        ) : null}
      </div>

      {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}

      {!parcel ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-sm text-slate-600">Loading parcel record...</div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="font-semibold text-slate-950">Operational details</h2>
            </div>
            <dl className="grid px-4 sm:grid-cols-2 sm:gap-x-8">
              <Field label="Tracking ID" value={<span className="font-mono">{parcel.trackingId}</span>} />
              <Field label="Barcode" value={parcel.barcode ? <span className="font-mono">{parcel.barcode}</span> : "-"} />
              <Field label="Destination" value={parcel.destination} />
              <Field label="Source" value={parcel.source} />
              <Field label="Weight" value={parcel.weightKg ? `${parcel.weightKg} kg` : "-"} />
              <Field label="Size" value={parcel.size} />
              <Field label="Parcel type" value={parcel.parcelType} />
              <Field label="Customer note" value={parcel.note} />
              <Field label="Price" value={formatMoney(parcel.price)} />
              <Field label="Amount paid" value={formatMoney(parcel.amountPaid)} />
              <Field label="Price confirmed" value={formatDateTime(parcel.thaiPostPriceConfirmedAt)} />
              <Field label="Penalty clock" value={formatDateTime(parcel.penaltyClockStartedAt)} />
              <Field label="Created" value={formatDateTime(parcel.createdAt)} />
              <Field label="Updated" value={formatDateTime(parcel.updatedAt)} />
            </dl>
          </section>

          <aside className="space-y-6">
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="font-semibold text-slate-950">Status control</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">Status changes notify the customer when the parcel is attached to a LINE user.</p>
              <label className="mt-4 block text-sm font-medium text-slate-700">
                Parcel status
                <select
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={save}
                disabled={saving || status === parcel.status}
                className="mt-4 h-10 w-full rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {saving ? "Saving..." : "Save status"}
              </button>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="font-semibold text-slate-950">Record ID</h2>
              <p className="mt-2 break-all font-mono text-xs leading-5 text-slate-600">{parcel.id}</p>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
