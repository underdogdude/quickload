"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Every route a signed-in user can reach from the shell (bottom nav + home tiles).
 * Listed once here so we warm them all on first paint and on every navigation.
 */
const ROUTES = [
  "/",
  "/parcels",
  "/addresses",
  "/payment",
  "/send",
  "/help",
  "/manual",
] as const;

/**
 * Small user-scoped JSON payloads that pages read shortly after navigation.
 * We populate the browser HTTP cache (they already send `Cache-Control: private, swr`)
 * so the first read after a click is an instant memory hit.
 */
const API_PREFETCH = [
  "/api/me",
  "/api/sender-addresses",
  "/api/recipient-addresses",
  "/api/parcels",
] as const;

type IdleWindow = Window & {
  requestIdleCallback?: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function schedule(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const w = window as IdleWindow;
  if (typeof w.requestIdleCallback === "function") {
    const id = w.requestIdleCallback(() => cb(), { timeout: 1500 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(cb, 250);
  return () => window.clearTimeout(id);
}

/**
 * Client-only component mounted once in the root layout for logged-in users.
 *
 * - Calls `router.prefetch()` on every top route so the RSC payload + JS chunks
 *   are in memory before the user clicks (default `<Link>` behaviour only
 *   warms dynamic routes on hover).
 * - Issues low-priority `fetch()`s for the small user-scoped GETs so their
 *   response is already in the HTTP cache for the next page.
 *
 * All work runs in `requestIdleCallback`, so it never competes with the
 * first paint of the current page.
 */
export function RoutePrefetcher() {
  const router = useRouter();

  useEffect(() => {
    const cancel = schedule(() => {
      for (const href of ROUTES) {
        try {
          router.prefetch(href);
        } catch {
          // router.prefetch throws on malformed hrefs only; safe to ignore.
        }
      }

      for (const url of API_PREFETCH) {
        fetch(url, {
          method: "GET",
          credentials: "same-origin",
          // `priority` is a widely supported fetch hint; typed `any` to avoid TS lib gap.
          ...({ priority: "low" } as RequestInit),
        }).catch(() => {
          /* Warmers are best-effort; failures are silent. */
        });
      }
    });
    return cancel;
  }, [router]);

  return null;
}
