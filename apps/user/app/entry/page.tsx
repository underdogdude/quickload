"use client";

import { navigateAfterAuth } from "@/lib/navigate-after-auth";
import lineLiff, { type Liff } from "@line/liff";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type EntryProfile = {
  name?: string;
  pictureUrl?: string;
};

type Status = "checking" | "signing_in" | "error";

const TITLE_FONT_CLASS = "font-title-placeholder";
// liff.init() can hang on Android if called too late after page load (native LIFF
// bridge has a finite readiness window). Timeout is a safety net; the real fix is
// calling liff.init() at t=0 in parallel with the session pre-check (see effect).
const LIFF_INIT_TIMEOUT_MS = 10000;
const LIFF_INIT_RETRY_KEY = "liff_init_retry";

/**
 * Starts liff.init() immediately and returns a promise resolving to the liff
 * instance. The promise is stored in a ref so signIn() can await an init that
 * has been running concurrently with the session pre-check.
 */
function startLiffInit(liffId: string): Promise<Liff> {
  const p = (async () => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        lineLiff.init({ liffId }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("LIFF_INIT_TIMEOUT")), LIFF_INIT_TIMEOUT_MS);
        }),
      ]);
      return lineLiff;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  })();
  // Suppress unhandled-rejection warning; signIn() catches it when it awaits.
  p.catch(() => {});
  return p;
}

export default function EntryPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [msg, setMsg] = useState("กำลังตรวจสอบการเข้าสู่ระบบ…");
  const [profile, setProfile] = useState<EntryProfile | null>(null);
  const [attempt, setAttempt] = useState(0);
  const runIdRef = useRef(0);
  // Holds the liff.init() promise that is started at the very top of the effect,
  // BEFORE the session pre-check, so that both run concurrently.
  const liffInitRef = useRef<Promise<Liff> | null>(null);
  const skipLineAuth =
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_DEV_SKIP_LINE_AUTH === "true";

  const signIn = useCallback(async (liffPromise: Promise<Liff>, isRunActive: () => boolean) => {
    try {
      setMsg("กำลังเชื่อมต่อ LINE…");
      // Await the liff.init() that was already started at page load.
      // By the time signIn() is called, it has been running for however long
      // the pre-check took (up to 6 s) and is likely already resolved.
      const liff = await liffPromise.catch((e) => {
        if (liffInitRef.current === liffPromise) {
          liffInitRef.current = null;
        }
        throw e;
      });
      if (!isRunActive()) return;
      try {
        sessionStorage.removeItem(LIFF_INIT_RETRY_KEY);
      } catch {
        /* ignore */
      }

      if (!liff.isLoggedIn()) {
        setMsg("กำลังพาไปยังหน้าล็อกอิน LINE…");
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
        if (!isRunActive()) return;
        setProfile({ name: p.displayName, pictureUrl: p.pictureUrl });
        setMsg(`กำลังยืนยันตัวตน ${p.displayName}…`);
      } catch {
        setMsg("กำลังยืนยันตัวตนกับเซิร์ฟเวอร์…");
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      let res: Response;
      try {
        res = await fetch("/api/auth/line", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (!isRunActive()) return;
      const text = await res.text();
      const json = text
        ? (JSON.parse(text) as { ok?: boolean; error?: string; needsRegistration?: boolean })
        : {};
      if (!res.ok || !json.ok) {
        setStatus("error");
        setMsg(json.error ?? "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
        return;
      }
      if (isRunActive()) {
        // Hard nav ensures the new iron-session cookie is included in the very next
        // request, avoiding a middleware bounce in LINE in-app browser.
        navigateAfterAuth(router, json.needsRegistration ? "/register" : "/", { hard: true });
      }
    } catch (e) {
      if (!isRunActive()) return;
      if (e instanceof Error && e.message === "LIFF_INIT_TIMEOUT") {
        // Reset so the next attempt (retry button) starts a fresh liff.init().
        liffInitRef.current = null;
        try {
          if (!sessionStorage.getItem(LIFF_INIT_RETRY_KEY)) {
            sessionStorage.setItem(LIFF_INIT_RETRY_KEY, "1");
            // Reload the page — this resets the WebView's page context.
            // Note: only a full WebView destroy/recreate (i.e. manually closing and
            // reopening LINE) resets the native LIFF bridge. That is why we call
            // liff.init() at t=0 (before the pre-check) rather than relying on reload.
            window.location.replace(`${window.location.origin}${window.location.pathname}`);
            return;
          }
        } catch {
          /* sessionStorage unavailable — fall through to error */
        }
        setStatus("error");
        setMsg("ไม่สามารถเชื่อมต่อ LINE ได้ กรุณาปิดและเปิดแอปใหม่อีกครั้ง");
        return;
      }
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
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    const isRunActive = () => runIdRef.current === runId;

    if (skipLineAuth) {
      navigateAfterAuth(router, "/", { hard: true });
      return;
    }

    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;

    // ─── CRITICAL: start liff.init() HERE, synchronously, before the pre-check. ───
    //
    // Root cause of the Android first-login hang:
    //   The LINE in-app browser creates a native LIFF bridge when it opens the
    //   WebView. That bridge has a finite readiness window (~a few seconds from
    //   page load). If liff.init() is called after this window closes — which
    //   happens when the 6-second session pre-check runs first — the init call
    //   hangs forever because the bridge is no longer listening.
    //
    // Fix: call liff.init() at t≈0 and run the pre-check concurrently. By the
    // time the pre-check finishes, liff.init() has been running in parallel and
    // is typically already resolved, well within the bridge window.
    if (liffId && !liffInitRef.current) {
      liffInitRef.current = startLiffInit(liffId);
    }

    (async () => {
      setStatus("checking");
      setMsg("กำลังตรวจสอบการเข้าสู่ระบบ…");

      // Pre-check: does the user already have a valid session?
      // liff.init() is now running in parallel so this delay no longer blocks it.
      try {
        const preCheckController = new AbortController();
        const preCheckTimer = setTimeout(() => preCheckController.abort(), 6000);
        let res: Response;
        try {
          res = await fetch("/api/me", {
            cache: "no-store",
            signal: preCheckController.signal,
          });
        } finally {
          clearTimeout(preCheckTimer);
        }
        if (!isRunActive()) return;
        if (res.ok) {
          const json = (await res.json()) as {
            ok?: boolean;
            data?: { firstName?: string | null; lastName?: string | null; phone?: string | null };
          };
          if (json.ok && json.data) {
            const complete = Boolean(
              json.data.firstName?.trim() && json.data.lastName?.trim() && json.data.phone?.trim(),
            );
            // Hard nav: iron-session cookie was set by a previous request; a soft nav +
            // router.refresh() can race with middleware in LINE in-app browser and bounce
            // the user back to /entry before the new server component picks up the cookie.
            navigateAfterAuth(router, complete ? "/" : "/register", { hard: true });
            return;
          }
        }
      } catch {
        /* Timed out or network error — fall through to full LIFF sign-in. */
      }

      if (!isRunActive()) return;

      if (!liffId) {
        setStatus("error");
        setMsg("ยังไม่ได้ตั้งค่า LIFF ID กรุณาติดต่อทีมงาน");
        return;
      }

      // Defensive: ensure ref is set (should always be true when liffId exists).
      if (!liffInitRef.current) {
        liffInitRef.current = startLiffInit(liffId);
      }

      setStatus("signing_in");
      await signIn(liffInitRef.current, isRunActive);
    })();

    return () => {
      if (runIdRef.current === runId) {
        runIdRef.current += 1;
      }
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
