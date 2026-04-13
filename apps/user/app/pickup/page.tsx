"use client";

import { useEffect, useState } from "react";

type Slot = {
  id: string;
  date: string;
  timeWindow: string;
  bookedCount: number;
  maxCapacity: number;
};

export default function PickupPage() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotId, setSlotId] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/pickup/slots");
      const json = (await res.json()) as { ok?: boolean; data?: Slot[] };
      if (cancelled) return;
      if (res.ok && json.ok) setSlots(json.data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch("/api/pickup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId, address, note }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) {
      setMsg(json.error ?? "Failed");
      return;
    }
    setMsg("Booked");
    setAddress("");
    setNote("");
  }

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="text-lg font-semibold">Book pickup</h1>

      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <label className="block text-sm">
          Slot
          <select
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={slotId}
            onChange={(e) => setSlotId(e.target.value)}
            required
          >
            <option value="">Select…</option>
            {slots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.date} · {s.timeWindow} ({s.bookedCount}/{s.maxCapacity})
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Address
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          Note
          <textarea
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <button type="submit" className="rounded bg-emerald-600 px-4 py-2 text-white">
          Book
        </button>
      </form>
      {msg && <p className="mt-3 text-sm text-slate-700">{msg}</p>}
    </main>
  );
}
