/**
 * In-API / in-memory normalized row (after `thaiPostEventsForApiFromHistory`).
 *
 * In Postgres `status_history` we **store carrier-shaped** objects:
 * `barcode`, `status`, `statusDescription`, `statusDate`, `station`,
 * plus `id` and `createdAt` (server receipt time, ISO-8601).
 * Legacy rows may still use statusCode/description/statusDateRaw until rewritten.
 */

export type ThaiPostWebhookHistoryEntry = {
  id: string;
  statusCode: string;
  description: string | null;
  statusDateRaw: string | null;
  station: string | null;
  barcode?: string | null;
  /** ISO-8601 when our system recorded this webhook (or migrated from legacy row). */
  createdAt: string;
};

/** Parse "DD/MM/YYYY HH:mm:ss" (Thailand Post style) as local wall time → epoch ms. */
export function thaiPostStatusDateToMs(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const y = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const s = Number(m[6]);
  const dt = new Date(y, mo, d, h, mi, s);
  const t = dt.getTime();
  return Number.isNaN(t) ? null : t;
}

/** JSONB / driver quirks: value may be a JSON string, or not an array — normalize before parsing entries. */
export function statusHistoryRawToArray(raw: unknown): unknown[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(raw)) {
    try {
      const p = JSON.parse(raw.toString("utf8")) as unknown;
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw) as unknown;
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

function coerceEntry(x: unknown, index: number): ThaiPostWebhookHistoryEntry | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;

  const statusCode =
    typeof o.statusCode === "string"
      ? o.statusCode
      : typeof o.statusCode === "number" && Number.isFinite(o.statusCode)
        ? String(Math.trunc(o.statusCode))
        : typeof o.status === "string"
          ? o.status
          : typeof o.status === "number" && Number.isFinite(o.status)
            ? String(Math.trunc(o.status))
            : null;
  if (!statusCode) return null;

  const description =
    o.description != null
      ? String(o.description)
      : o.statusDescription != null
        ? String(o.statusDescription)
        : null;

  const statusDateRaw =
    o.statusDateRaw != null
      ? String(o.statusDateRaw)
      : o.statusDate != null
        ? String(o.statusDate)
        : null;

  const station = o.station == null ? null : String(o.station);
  const barcode =
    typeof o.barcode === "string" ? o.barcode : o.barcode == null ? null : String(o.barcode);

  const id =
    typeof o.id === "string" && o.id.trim()
      ? o.id.trim()
      : `snap-${index}-${statusCode}-${statusDateRaw ?? "nodate"}`;

  let createdAt: string;
  if (o.createdAt instanceof Date && !Number.isNaN(o.createdAt.getTime())) {
    createdAt = o.createdAt.toISOString();
  } else if (typeof o.createdAt === "string" && o.createdAt.trim()) {
    createdAt = o.createdAt.trim();
  } else {
    const fromCarrier = thaiPostStatusDateToMs(statusDateRaw);
    createdAt =
      fromCarrier != null
        ? new Date(fromCarrier).toISOString()
        : new Date(0).toISOString();
  }

  return {
    id,
    statusCode,
    description,
    statusDateRaw,
    station,
    barcode,
    createdAt,
  };
}

/** One element of `status_history` as persisted (Thailand Post field names + id + createdAt). */
export type ThaiPostCarrierHistoryStored = {
  id: string;
  barcode: string;
  status: string;
  statusDescription: string;
  statusDate: string | null;
  station: string | null;
  createdAt: string;
};

/** Convert normalized entry back to the shape we store in JSONB (and that matches carrier webhooks). */
export function toCarrierHistoryStored(
  e: ThaiPostWebhookHistoryEntry,
  barcodeFallback: string,
): ThaiPostCarrierHistoryStored {
  const bc = (e.barcode && String(e.barcode).trim()) || barcodeFallback;
  return {
    id: e.id,
    barcode: bc,
    status: e.statusCode,
    statusDescription: e.description ?? "",
    statusDate: e.statusDateRaw,
    station: e.station,
    createdAt: e.createdAt,
  };
}

/**
 * Chronological order (oldest → newest) for timelines:
 * primary = carrier `statusDate` when parseable, else system `createdAt`.
 */
function parseCreatedMs(s: string): number {
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
}

export function thaiPostEventsForApiFromHistory(raw: unknown): ThaiPostWebhookHistoryEntry[] {
  const rawArr = statusHistoryRawToArray(raw);
  const out: ThaiPostWebhookHistoryEntry[] = [];
  for (let i = 0; i < rawArr.length; i++) {
    const e = coerceEntry(rawArr[i], i);
    if (e) out.push(e);
  }
  out.sort((a, b) => {
    const ta = thaiPostStatusDateToMs(a.statusDateRaw) ?? parseCreatedMs(a.createdAt);
    const tb = thaiPostStatusDateToMs(b.statusDateRaw) ?? parseCreatedMs(b.createdAt);
    if (ta !== tb) return ta - tb;
    return parseCreatedMs(a.createdAt) - parseCreatedMs(b.createdAt);
  });
  return out;
}
