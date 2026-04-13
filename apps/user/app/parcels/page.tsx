"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ParcelRow = {
  id: string;
  trackingId: string;
  status: string;
  destination: string | null;
};

export default function ParcelsPage() {
  const [items, setItems] = useState<ParcelRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/parcels");
      const json = (await res.json()) as { ok?: boolean; data?: ParcelRow[]; error?: string };
      if (cancelled) return;
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Failed to load");
        return;
      }
      setItems(json.data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="text-lg font-semibold">My parcels</h1>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <ul className="mt-4 space-y-2">
        {items.map((p) => (
          <li key={p.id} className="rounded border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">{p.trackingId}</div>
                <div className="text-xs text-slate-600">{p.status}</div>
              </div>
              <Link className="text-sm text-emerald-700 underline" href={`/parcels/${p.id}`}>
                Details
              </Link>
            </div>
          </li>
        ))}
      </ul>
      {items.length === 0 && !error && <p className="mt-4 text-sm text-slate-600">No parcels yet.</p>}
    </main>
  );
}
