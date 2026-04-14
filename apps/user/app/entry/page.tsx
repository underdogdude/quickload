"use client";

import liff from "@line/liff";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function EntryPage() {
  const router = useRouter();
  const [msg, setMsg] = useState("Signing in with LINE…");
  const skipLineAuth = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEV_SKIP_LINE_AUTH === "true";

  useEffect(() => {
    if (skipLineAuth) {
      router.replace("/");
      return;
    }

    let cancelled = false;
    (async () => {
      const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
      if (!liffId) {
        setMsg("LIFF ID is not configured");
        return;
      }
      try {
        await liff.init({ liffId });
        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }
        const accessToken = liff.getAccessToken();
        if (!accessToken) {
          setMsg("Missing access token");
          return;
        }
        const res = await fetch("/api/auth/line", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken }),
        });
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          setMsg(json.error ?? "Login failed");
          return;
        }
        if (!cancelled) router.replace("/");
      } catch (e) {
        if (!cancelled) setMsg(e instanceof Error ? e.message : "Unexpected error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, skipLineAuth]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <p className="text-center text-sm text-slate-700">{msg}</p>
    </main>
  );
}
