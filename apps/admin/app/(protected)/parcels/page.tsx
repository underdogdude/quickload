"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ParcelRow = { id: string; trackingId: string; status: string; destination: string | null };

export default function AdminParcelsPage() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ParcelRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const url = useMemo(() => (q.trim() ? `/api/parcels?q=${encodeURIComponent(q.trim())}` : "/api/parcels"), [q]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(url);
      const json = (await res.json()) as { ok?: boolean; data?: ParcelRow[]; error?: string };
      if (cancelled) return;
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Failed");
        return;
      }
      setItems(json.data ?? []);
      setError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <main>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Parcels</h1>
          <p className="text-sm text-slate-600">Search by tracking id or destination.</p>
        </div>
        <Link className="text-sm text-emerald-700 underline" href="/parcels/new">
          New parcel
        </Link>
      </div>

      <div className="mt-4">
        <input
          className="w-full max-w-md rounded border border-slate-300 px-3 py-2 text-sm"
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <div className="mt-4 overflow-auto rounded border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-600">
            <tr>
              <th className="px-3 py-2">Tracking</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Destination</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium">{p.trackingId}</td>
                <td className="px-3 py-2">{p.status}</td>
                <td className="px-3 py-2 text-slate-700">{p.destination ?? "—"}</td>
                <td className="px-3 py-2 text-right">
                  <Link className="text-emerald-700 underline" href={`/parcels/${p.id}`}>
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
