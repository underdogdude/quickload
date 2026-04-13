"use client";

import { useState } from "react";

export default function TrackingPage() {
  const [trackingId, setTrackingId] = useState("");
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setData(null);
    const res = await fetch(`/api/parcels/by-tracking/${encodeURIComponent(trackingId)}`);
    const body = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      setError((body.error as string | undefined) ?? "Not found");
      return;
    }
    setData(body);
  }

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="text-lg font-semibold">Tracking</h1>
      <form onSubmit={onSearch} className="mt-4 flex gap-2">
        <input
          className="flex-1 rounded border border-slate-300 px-3 py-2"
          placeholder="Tracking ID"
          value={trackingId}
          onChange={(e) => setTrackingId(e.target.value)}
          required
        />
        <button className="rounded bg-emerald-600 px-4 py-2 text-white" type="submit">
          Search
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {data && (
        <pre className="mt-4 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-50">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </main>
  );
}
