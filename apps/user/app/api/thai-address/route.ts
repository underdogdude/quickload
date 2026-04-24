import type { Address } from "thailand-address-database";
import { CacheHeaders, jsonWithCache } from "@/lib/api-cache";
import { searchThaiAddresses } from "@/lib/thai-address-search";

export const runtime = "nodejs";

type CacheEntry = { data: Address[]; hits: number };

/**
 * In-memory LRU-ish cache keyed by `${q}|${limit}`.
 * The Thai address DB is static — identical queries always return identical results,
 * so we can hold a modest window of recent queries per server process.
 */
const MAX_ENTRIES = 500;
const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): Address[] | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  entry.hits += 1;
  cache.delete(key);
  cache.set(key, entry);
  return entry.data;
}

function cacheSet(key: string, data: Address[]) {
  if (cache.size >= MAX_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, { data, hits: 1 });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limitRaw = searchParams.get("limit");
  const limit = Math.min(Math.max(Number(limitRaw) || 25, 1), 50);

  if (!q) {
    return jsonWithCache({ ok: true, data: [] as Address[] }, CacheHeaders.publicLong());
  }

  const key = `${q}|${limit}`;
  const cached = cacheGet(key);
  if (cached) {
    return jsonWithCache({ ok: true, data: cached }, CacheHeaders.publicLong());
  }

  const data = searchThaiAddresses(q, limit);
  cacheSet(key, data);
  return jsonWithCache({ ok: true, data }, CacheHeaders.publicLong());
}
