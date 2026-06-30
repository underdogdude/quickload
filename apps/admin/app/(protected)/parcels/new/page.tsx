"use client";

import { PageHeader } from "@/app/admin-ui";
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
    <div className="space-y-6">
      <PageHeader title="Create parcel" description="Create a lightweight admin parcel record when a support case needs manual tracking." />
      <form onSubmit={onSubmit} className="max-w-2xl space-y-4 rounded-lg border border-slate-200 bg-white p-5">
        <label className="block text-sm font-medium text-slate-700">
          Tracking ID
          <input
            className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500"
            value={trackingId}
            onChange={(e) => setTrackingId(e.target.value)}
            placeholder="Carrier tracking or internal reference"
            required
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Destination
          <input
            className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Optional destination note"
          />
        </label>
        <button type="submit" className="h-10 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800">
          Create
        </button>
        {error && <p className="text-sm font-medium text-rose-700">{error}</p>}
      </form>
    </div>
  );
}
