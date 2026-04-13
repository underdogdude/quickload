"use client";

import { useEffect, useState } from "react";

type Row = { id: string; status: string; address: string; userId: string };

export default function PickupsPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/pickups");
    const json = (await res.json()) as { ok?: boolean; data?: Row[]; error?: string };
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

  async function patch(id: string, status: "confirmed" | "cancelled" | "completed") {
    const res = await fetch(`/api/pickups/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
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
      <h1 className="text-xl font-semibold">Pickups</h1>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <div className="mt-4 overflow-auto rounded border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-600">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Address</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono text-xs">{p.id}</td>
                <td className="px-3 py-2">{p.status}</td>
                <td className="px-3 py-2">{p.address}</td>
                <td className="px-3 py-2 space-x-2">
                  <button type="button" className="text-emerald-700 underline" onClick={() => patch(p.id, "confirmed")}>
                    Confirm
                  </button>
                  <button type="button" className="text-slate-700 underline" onClick={() => patch(p.id, "cancelled")}>
                    Cancel
                  </button>
                  <button type="button" className="text-slate-700 underline" onClick={() => patch(p.id, "completed")}>
                    Complete
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
