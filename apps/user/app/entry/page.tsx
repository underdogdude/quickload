"use client";

import liff from "@line/liff";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type EntryProfile = {
  name?: string;
  pictureUrl?: string;
};

export default function EntryPage() {
  const router = useRouter();
  const [msg, setMsg] = useState("Signing in with LINE…");
  const [profile, setProfile] = useState<EntryProfile | null>(null);
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
        try {
          const p = await liff.getProfile();
          setProfile({ name: p.displayName, pictureUrl: p.pictureUrl });
          setMsg("Signing in as " + p.displayName + "…");
        } catch {
          // Keep flow working even when profile retrieval fails.
        }
        const res = await fetch("/api/auth/line", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken }),
        });
        const json = (await res.json()) as { ok?: boolean; error?: string; needsRegistration?: boolean };
        if (!res.ok || !json.ok) {
          setMsg(json.error ?? "Login failed");
          return;
        }
        if (!cancelled) router.replace(json.needsRegistration ? "/register" : "/");
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
      {profile?.pictureUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- LINE profile image URL
        <img
          src={profile.pictureUrl}
          alt=""
          width={72}
          height={72}
          className="mb-3 h-[72px] w-[72px] rounded-full object-cover ring-2 ring-emerald-100"
          referrerPolicy="no-referrer"
        />
      ) : null}
      {profile?.name ? <p className="mb-2 text-sm font-medium text-slate-900">{profile.name}</p> : null}
      <p className="text-center text-sm text-slate-700">{msg}</p>
    </main>
  );
}
