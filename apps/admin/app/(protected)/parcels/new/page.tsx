"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewParcelPage() {
  const router = useRouter();
  const [trackingId, setTrackingId] = useState("");
  const [destination, setDestination] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/parcels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackingId, destination }),
    });
    const json = (await res.json()) as { ok?: boolean; data?: { id: string }; error?: string };
    if (!res.ok || !json.ok) {
      setError(json.error ?? "Failed");
      return;
    }
    router.replace(`/parcels/${json.data?.id}`);
  }

  return (
    <main className="mx-auto max-w-lg">
      <h1 className="text-xl font-semibold">Create parcel</h1>
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <label className="block text-sm">
          Tracking ID
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={trackingId}
            onChange={(e) => setTrackingId(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          Destination
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          />
        </label>
        <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white">
          Create
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </main>
  );
}
