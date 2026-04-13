"use client";

import { useState } from "react";

export default function RegisterParcelPage() {
  const [trackingId, setTrackingId] = useState("");
  const [destination, setDestination] = useState("");
  const [size, setSize] = useState("M");
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch("/api/parcels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackingId, destination, size }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) {
      setMsg(json.error ?? "Failed");
      return;
    }
    setMsg("Saved");
    setTrackingId("");
    setDestination("");
  }

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="text-lg font-semibold">Register parcel</h1>
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
        <label className="block text-sm">
          Size
          <select
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={size}
            onChange={(e) => setSize(e.target.value)}
          >
            {["S", "M", "L", "XL"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded bg-emerald-600 px-4 py-2 text-white">
          Submit
        </button>
      </form>
      {msg && <p className="mt-3 text-sm text-slate-700">{msg}</p>}
    </main>
  );
}
