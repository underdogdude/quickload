"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function ParcelDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [json, setJson] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/parcels/${id}`);
      const body = (await res.json()) as Record<string, unknown>;
      if (cancelled) return;
      if (!res.ok) {
        setError((body.error as string | undefined) ?? "Failed");
        return;
      }
      setJson(body);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="text-lg font-semibold">Parcel detail</h1>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <pre className="mt-4 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-50">
        {JSON.stringify(json, null, 2)}
      </pre>
    </main>
  );
}
