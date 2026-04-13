"use client";

import { useEffect, useState } from "react";

type Row = { id: string; lineUserId: string; displayName: string | null; phone: string | null };

export default function MembersPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/members");
      const json = (await res.json()) as { ok?: boolean; data?: Row[]; error?: string };
      if (cancelled) return;
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Failed");
        return;
      }
      setItems(json.data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <h1 className="text-xl font-semibold">LINE members</h1>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <div className="mt-4 overflow-auto rounded border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-600">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">LINE user id</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">User id</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{m.displayName ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">{m.lineUserId}</td>
                <td className="px-3 py-2">{m.phone ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">{m.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
