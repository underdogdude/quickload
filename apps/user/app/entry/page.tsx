"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type EntryProfile = {
  name?: string;
  pictureUrl?: string;
};

type Status = "checking" | "signing_in" | "error";

const TITLE_FONT_CLASS = "font-title-placeholder";

export default function EntryPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [msg, setMsg] = useState("กำลังตรวจสอบการเข้าสู่ระบบ…");
  const [profile, setProfile] = useState<EntryProfile | null>(null);
  const [attempt, setAttempt] = useState(0);
  const cancelledRef = useRef(false);
  const skipLineAuth = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEV_SKIP_LINE_AUTH === "true";

  const signIn = useCallback(async () => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (!liffId) {
      setStatus("error");
      setMsg("ยังไม่ได้ตั้งค่า LIFF ID กรุณาติดต่อทีมงาน");
      return;
    }

    try {
      const liff = (await import("@line/liff")).default;
      await liff.init({ liffId });
      if (!liff.isLoggedIn()) {
        liff.login();
        return;
      }
      const accessToken = liff.getAccessToken();
      if (!accessToken) {
        setStatus("error");
        setMsg("ไม่พบ access token กรุณาลองใหม่อีกครั้ง");
        return;
      }

      try {
        const p = await liff.getProfile();
        setProfile({ name: p.displayName, pictureUrl: p.pictureUrl });
        setMsg(`กำลังเข้าสู่ระบบ ${p.displayName}…`);
      } catch {
        /* Continue even if LINE profile fetch fails. */
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const res = await fetch("/api/auth/line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const text = await res.text();
      const json = text ? (JSON.parse(text) as { ok?: boolean; error?: string; needsRegistration?: boolean }) : {};
      if (!res.ok || !json.ok) {
        setStatus("error");
        setMsg(json.error ?? "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
        return;
      }
      if (!cancelledRef.current) {
        router.replace(json.needsRegistration ? "/register" : "/");
      }
    } catch (e) {
      if (cancelledRef.current) return;
      setStatus("error");
      if (e instanceof Error && e.name === "AbortError") {
        setMsg("การเข้าสู่ระบบใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง");
        return;
      }
      const rawMsg = e instanceof Error ? e.message : "";
      if (/liff|LIFF/i.test(rawMsg)) {
        setMsg("กรุณาเปิดหน้านี้จากแอป LINE เพื่อเข้าสู่ระบบ");
        return;
      }
      setMsg(rawMsg || "เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง");
    }
  }, [router]);

  useEffect(() => {
    cancelledRef.current = false;

    if (skipLineAuth) {
      router.replace("/");
      return;
    }

    (async () => {
      setStatus("checking");
      setMsg("กำลังตรวจสอบการเข้าสู่ระบบ…");
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        if (cancelledRef.current) return;
        if (res.ok) {
          const json = (await res.json()) as {
            ok?: boolean;
            data?: { firstName?: string | null; lastName?: string | null; phone?: string | null };
          };
          if (json.ok && json.data) {
            const complete = Boolean(
              json.data.firstName?.trim() && json.data.lastName?.trim() && json.data.phone?.trim(),
            );
            router.replace(complete ? "/" : "/register");
            return;
          }
        }
      } catch {
        /* Fall through to full LIFF sign-in. */
      }

      if (cancelledRef.current) return;
      setStatus("signing_in");
      setMsg("กำลังเข้าสู่ระบบด้วย LINE…");
      await signIn();
    })();

    return () => {
      cancelledRef.current = true;
    };
  }, [router, signIn, skipLineAuth, attempt]);

  const isError = status === "error";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#2726F5] to-[#5655ff] px-6 py-12 text-white">
      <div className="flex flex-col items-center text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
          {/* eslint-disable-next-line @next/next/no-img-element -- local asset, no optimization needed here */}
          <img src="/truck.png" alt="" className="h-12 w-12 object-contain" />
        </div>
        <h1 className={`${TITLE_FONT_CLASS} text-3xl font-bold`}>Quickload</h1>
        <p className="mt-1 text-sm text-white/80">บริการจัดส่งพัสดุผ่าน LINE</p>

        {profile?.pictureUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- LINE CDN profile image
          <img
            src={profile.pictureUrl}
            alt=""
            width={64}
            height={64}
            className="mt-8 h-16 w-16 rounded-full object-cover ring-2 ring-white/40"
            referrerPolicy="no-referrer"
          />
        ) : null}
        {profile?.name ? (
          <p className="mt-3 text-sm font-medium text-white">{profile.name}</p>
        ) : null}

        <div className="mt-8 flex flex-col items-center gap-3">
          {!isError ? (
            <span
              className="h-8 w-8 animate-spin rounded-full border-[3px] border-white/30 border-t-white"
              aria-label="กำลังโหลด"
            />
          ) : null}
          <p className="max-w-xs text-center text-sm text-white/90">{msg}</p>
          {isError ? (
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="mt-2 rounded-xl bg-white px-5 py-2 text-sm font-medium text-[#2726F5] shadow-sm transition hover:bg-white/90"
            >
              ลองใหม่อีกครั้ง
            </button>
          ) : null}
        </div>
      </div>
    </main>
  );
}
