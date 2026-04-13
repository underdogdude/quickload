"use client";

import liff from "@line/liff";
import { useEffect, useState } from "react";

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID ?? "";
const SKIP_LIFF = process.env.NEXT_PUBLIC_DEV_SKIP_LINE_AUTH === "true";

export function LiffProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(SKIP_LIFF);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (SKIP_LIFF) return;

    let cancelled = false;
    (async () => {
      try {
        if (!LIFF_ID) {
          setError("NEXT_PUBLIC_LIFF_ID is not configured");
          return;
        }
        await liff.init({ liffId: LIFF_ID });
        if (cancelled) return;
        setReady(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "LIFF init failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-md p-6">
        <p className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-600">
        Initializing LINE LIFF…
      </div>
    );
  }

  return <>{children}</>;
}
