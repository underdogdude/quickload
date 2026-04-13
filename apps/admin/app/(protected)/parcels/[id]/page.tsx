"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const statuses = ["registered", "in_transit", "delivered", "failed"] as const;

export default function AdminParcelDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const [parcel, setParcel] = useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = useState<string>("registered");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/parcels/${id}`);
      const json = (await res.json()) as { ok?: boolean; data?: Record<string, unknown>; error?: string };
      if (cancelled) return;
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Failed");
        return;
      }
      setParcel(json.data ?? null);
      if (json.data && typeof json.data.status === "string") setStatus(json.data.status);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function save() {
    setError(null);
    const res = await fetch(`/api/parcels/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string; data?: Record<string, unknown> };
    if (!res.ok || !json.ok) {
      setError(json.error ?? "Failed");
      return;
    }
    setParcel(json.data ?? null);
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-lg">
      <h1 className="text-xl font-semibold">Parcel</h1>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <pre className="mt-4 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-50">
        {JSON.stringify(parcel, null, 2)}
      </pre>
      <div className="mt-4 space-y-2">
        <label className="block text-sm">
          Status
          <select
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={save} className="rounded bg-slate-900 px-4 py-2 text-white">
          Save status
        </button>
      </div>
    </main>
  );
}
