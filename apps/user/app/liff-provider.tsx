"use client";

import liff from "@line/liff";
import { useEffect, useState } from "react";

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID ?? "";
const SKIP_LIFF = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEV_SKIP_LINE_AUTH === "true";
const LIFF_INIT_TIMEOUT_MS = 15000;

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
        await Promise.race([
          liff.init({ liffId: LIFF_ID }),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("LIFF initialization timed out")), LIFF_INIT_TIMEOUT_MS);
          }),
        ]);
        if (cancelled) return;
        setReady(true);
      } catch (e) {
        if (!cancelled) {
          const message = e instanceof Error ? e.message : "LIFF init failed";
          if (message === "LIFF initialization timed out") {
            setError("LIFF init timeout. Open this URL inside LINE app and verify LIFF Endpoint URL is reachable.");
            return;
          }
          setError(message);
        }
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
