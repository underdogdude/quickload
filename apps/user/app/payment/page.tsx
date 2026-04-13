"use client";

import { useEffect, useState } from "react";

export default function PaymentPage() {
  const [balance, setBalance] = useState<number | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/payment");
      const json = (await res.json()) as { ok?: boolean; data?: { balance: number | null }; error?: string };
      if (cancelled) return;
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Failed");
        return;
      }
      setBalance(json.data?.balance ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="text-lg font-semibold">Payment balance</h1>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {balance === undefined && !error && <p className="mt-2 text-sm text-slate-600">Loading…</p>}
      {balance !== undefined && !error && (
        <p className="mt-4 text-2xl font-semibold">{balance === null ? "—" : `${balance}`}</p>
      )}
    </main>
  );
}
