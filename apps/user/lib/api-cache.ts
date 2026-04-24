import { NextResponse } from "next/server";

/**
 * Cache-Control recipes for our API routes.
 *
 * - `noStore`: never cache (mutating endpoints).
 * - `privateShortSwr`: user-scoped GETs; browser caches for `maxAgeSec`,
 *   keeps serving `swrSec` seconds of stale while revalidating in the background.
 * - `publicLong`: deterministic public data (e.g. Thai address DB).
 */
export const CacheHeaders = {
  noStore: { "Cache-Control": "no-store" } as const,
  privateShortSwr: (maxAgeSec = 10, swrSec = 30) => ({
    "Cache-Control": `private, max-age=${maxAgeSec}, stale-while-revalidate=${swrSec}`,
  }),
  publicLong: (maxAgeSec = 3600, sMaxAgeSec = 86400) => ({
    "Cache-Control": `public, max-age=${maxAgeSec}, s-maxage=${sMaxAgeSec}, stale-while-revalidate=${sMaxAgeSec}`,
  }),
};

/** Convenience: NextResponse.json({...}, { headers: CacheHeaders.privateShortSwr() }) */
export function jsonWithCache<T>(
  body: T,
  headers: Record<string, string>,
  init?: { status?: number },
): NextResponse {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers,
  });
}
