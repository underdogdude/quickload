"use client";

import { useEffect, useState } from "react";

type Slot = {
  id: string;
  date: string;
  timeWindow: string;
  maxCapacity: number;
  bookedCount: number;
  isActive: boolean;
};

export default function SlotsPage() {
  const [items, setItems] = useState<Slot[]>([]);
  const [date, setDate] = useState("");
  const [timeWindow, setTimeWindow] = useState("09:00-12:00");
  const [maxCapacity, setMaxCapacity] = useState(10);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/pickups/slots");
    const json = (await res.json()) as { ok?: boolean; data?: Slot[]; error?: string };
    if (!res.ok || !json.ok) {
      setError(json.error ?? "Failed");
      return;
    }
    setItems(json.data ?? []);
    setError(null);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function createSlot(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/pickups/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, timeWindow, maxCapacity }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) {
      setError(json.error ?? "Failed");
      return;
    }
    setDate("");
    await refresh();
  }

  async function toggleActive(id: string, isActive: boolean) {
    const res = await fetch(`/api/pickups/slots/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) {
      setError(json.error ?? "Failed");
      return;
    }
    await refresh();
  }

  return (
    <main>
      <h1 className="text-xl font-semibold">Pickup slots</h1>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      <form onSubmit={createSlot} className="mt-4 grid gap-3 rounded border border-slate-200 bg-white p-4 sm:grid-cols-4">
        <label className="block text-sm sm:col-span-1">
          Date
          <input
            type="date"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm sm:col-span-1">
          Window
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={timeWindow}
            onChange={(e) => setTimeWindow(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm sm:col-span-1">
          Capacity
          <input
            type="number"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={maxCapacity}
            onChange={(e) => setMaxCapacity(Number(e.target.value))}
            min={1}
          />
        </label>
        <div className="flex items-end">
          <button type="submit" className="w-full rounded bg-slate-900 px-4 py-2 text-white">
            Add slot
          </button>
        </div>
      </form>

      <div className="mt-6 overflow-auto rounded border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-600">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Window</th>
              <th className="px-3 py-2">Booked</th>
              <th className="px-3 py-2">Active</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{s.date}</td>
                <td className="px-3 py-2">{s.timeWindow}</td>
                <td className="px-3 py-2">
                  {s.bookedCount}/{s.maxCapacity}
                </td>
                <td className="px-3 py-2">{s.isActive ? "yes" : "no"}</td>
                <td className="px-3 py-2 text-right">
                  <button type="button" className="text-slate-700 underline" onClick={() => toggleActive(s.id, s.isActive)}>
                    Toggle active
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
