"use client";

import { PageHeader } from "@/app/admin-ui";
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
    <div className="space-y-6">
      <PageHeader title="Members" description="LINE member records available for support lookup and manual notification workflows." />
      {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3 text-sm text-slate-600">
          Showing <span className="font-medium text-slate-950">{items.length}</span> members
        </div>
        <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">LINE user id</th>
              <th className="px-4 py-3">User id</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((m) => (
              <tr key={m.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-950">{m.displayName ?? "Unknown"}</td>
                <td className="px-4 py-3 text-slate-700">{m.phone ?? "-"}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{m.lineUserId}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{m.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {items.length === 0 ? <div className="border-t border-slate-100 px-4 py-10 text-center text-sm text-slate-600">No LINE members found.</div> : null}
      </div>
    </div>
  );
}
