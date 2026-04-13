const DEFAULT_TIMEOUT_MS = 30_000;

function legacyBase(): string {
  const base = process.env.LEGACY_API_BASE_URL;
  if (!base) throw new Error("LEGACY_API_BASE_URL is not set");
  return base.replace(/\/$/, "");
}

async function fetchLegacy<T>(path: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(`${legacyBase()}${path}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return { ok: false, error: `Legacy HTTP ${res.status}` };
    }
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  } finally {
    clearTimeout(t);
  }
}

export interface LegacyParcel {
  trackingId: string;
  destination?: string;
  status?: string;
  [key: string]: unknown;
}

export async function getLegacyParcel(trackingId: string): Promise<LegacyParcel | null> {
  const r = await fetchLegacy<LegacyParcel>(`/parcels/${encodeURIComponent(trackingId)}`);
  return r.ok ? r.data : null;
}

export async function getLegacyPaymentBalance(customerId: string): Promise<number | null> {
  const r = await fetchLegacy<{ balance?: number }>(
    `/customers/${encodeURIComponent(customerId)}/balance`,
  );
  if (!r.ok) return null;
  return typeof r.data.balance === "number" ? r.data.balance : null;
}

export interface LegacyTrackingEvent {
  at: string;
  label: string;
  [key: string]: unknown;
}

export async function getLegacyTrackingEvents(
  trackingId: string,
): Promise<LegacyTrackingEvent[]> {
  const r = await fetchLegacy<{ events?: LegacyTrackingEvent[] }>(
    `/parcels/${encodeURIComponent(trackingId)}/tracking`,
  );
  if (!r.ok || !r.data.events) return [];
  return r.data.events;
}
