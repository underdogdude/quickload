"use client";

import { PageHeader } from "@/app/admin-ui";
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
    <div className="space-y-6">
      <PageHeader title="Pickup slots" description="Create and manage pickup capacity windows for future pickup request workflows." />
      {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}

      <form onSubmit={createSlot} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4">
        <label className="block text-sm font-medium text-slate-700 sm:col-span-1">
          Date
          <input
            type="date"
            className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm font-medium text-slate-700 sm:col-span-1">
          Window
          <input
            className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500"
            value={timeWindow}
            onChange={(e) => setTimeWindow(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm font-medium text-slate-700 sm:col-span-1">
          Capacity
          <input
            type="number"
            className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500"
            value={maxCapacity}
            onChange={(e) => setMaxCapacity(Number(e.target.value))}
            min={1}
          />
        </label>
        <div className="flex items-end">
          <button type="submit" className="h-10 w-full rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800">
            Add slot
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3 text-sm text-slate-600">
          Showing <span className="font-medium text-slate-950">{items.length}</span> slots
        </div>
        <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Window</th>
              <th className="px-4 py-3">Booked</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-950">{s.date}</td>
                <td className="px-4 py-3 text-slate-700">{s.timeWindow}</td>
                <td className="px-4 py-3 text-slate-700">
                  {s.bookedCount}/{s.maxCapacity}
                </td>
                <td className="px-4 py-3">
                  {s.isActive ? (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                      Active
                    </span>
                  ) : (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
                      Inactive
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button type="button" className="text-sm font-medium text-emerald-700 hover:text-emerald-900" onClick={() => toggleActive(s.id, s.isActive)}>
                    Toggle
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {items.length === 0 ? <div className="border-t border-slate-100 px-4 py-10 text-center text-sm text-slate-600">No pickup slots configured.</div> : null}
      </div>
    </div>
  );
}
