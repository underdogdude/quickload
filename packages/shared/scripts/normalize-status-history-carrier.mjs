/**
 * Rewrite `thai_post_webhook_events.status_history` JSONB to carrier-shaped objects
 * (`barcode`, `status`, `statusDescription`, `statusDate`, `station`, `id`, `createdAt`).
 *
 * Also **rebuilds** history by merging:
 * - existing `status_history` (legacy keys normalized),
 * - the denormalized row snapshot (`status_code`, `status_description`, …),
 * - payloads in `raw_payload` (single object or array, as Thailand Post sends).
 *
 * Deduplicates by (status + statusDate + statusDescription) so we do not double the same event.
 *
 *   cd packages/shared && pnpm db:fix:status-history-carrier
 *
 * DATABASE_URL: same resolution as apply-sql.mjs (apps/user/.env.local first).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findDatabaseUrl() {
  const candidates = [
    path.join(__dirname, "../../../apps/user/.env.local"),
    path.join(__dirname, "../../../apps/user/.env"),
    path.join(__dirname, "../.env"),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      if (trimmed.startsWith("DATABASE_URL=")) {
        let v = trimmed.slice("DATABASE_URL=".length).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        return v;
      }
    }
  }
  return process.env.DATABASE_URL ?? null;
}

function thaiPostStatusDateToMs(raw) {
  if (raw == null || typeof raw !== "string" || !raw.trim()) return null;
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

function parseJsonMaybe(raw) {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

function normalizeItem(elem, index, rowBarcode) {
  if (!elem || typeof elem !== "object") return null;
  const o = elem;
  const status =
    typeof o.status === "string"
      ? o.status.trim()
      : typeof o.status === "number" && Number.isFinite(o.status)
        ? String(Math.trunc(o.status))
        : typeof o.statusCode === "string"
          ? o.statusCode.trim()
          : typeof o.statusCode === "number" && Number.isFinite(o.statusCode)
            ? String(Math.trunc(o.statusCode))
            : null;
  if (!status) return null;

  const statusDescription =
    o.statusDescription != null
      ? String(o.statusDescription)
      : o.description != null
        ? String(o.description)
        : "";

  let statusDate = null;
  if (o.statusDate != null) statusDate = String(o.statusDate);
  else if (o.statusDateRaw != null) statusDate = String(o.statusDateRaw);

  const station = o.station == null ? null : String(o.station);
  const barcode =
    typeof o.barcode === "string" && o.barcode.trim() ? o.barcode.trim() : String(rowBarcode ?? "");

  const id =
    typeof o.id === "string" && o.id.trim() ? o.id.trim() : `norm-${index}-${status}-${statusDate ?? "x"}`;

  let createdAt;
  if (typeof o.createdAt === "string" && o.createdAt.trim()) {
    createdAt = o.createdAt.trim();
  } else if (o.createdAt instanceof Date && !Number.isNaN(o.createdAt.getTime())) {
    createdAt = o.createdAt.toISOString();
  } else {
    const fromCarrier = thaiPostStatusDateToMs(statusDate);
    createdAt =
      fromCarrier != null ? new Date(fromCarrier).toISOString() : new Date(0).toISOString();
  }

  return { id, barcode, status, statusDescription, statusDate, station, createdAt };
}

function normalizeHistory(arr, rowBarcode) {
  let a = arr;
  if (typeof a === "string") {
    try {
      a = JSON.parse(a);
    } catch {
      return [];
    }
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(a)) {
    try {
      a = JSON.parse(a.toString("utf8"));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(a)) return [];
  const out = [];
  for (let i = 0; i < a.length; i++) {
    const n = normalizeItem(a[i], i, rowBarcode);
    if (n) out.push(n);
  }
  return out;
}

function dedupeKey(e) {
  return [String(e.status), e.statusDate != null ? String(e.statusDate) : "", String(e.statusDescription ?? "")].join(
    "\x00",
  );
}

/** Prefer first seen entry (keeps stable ids from existing history). */
function mergeByDedupe(lists) {
  const map = new Map();
  for (const list of lists) {
    for (const e of list) {
      if (!e) continue;
      const k = dedupeKey(e);
      if (!map.has(k)) map.set(k, e);
    }
  }
  return [...map.values()];
}

function sortCarrierHistory(out) {
  const parseCreated = (s) => {
    const t = Date.parse(s);
    return Number.isNaN(t) ? 0 : t;
  };
  out.sort((a, b) => {
    const ta = thaiPostStatusDateToMs(a.statusDate) ?? parseCreated(a.createdAt);
    const tb = thaiPostStatusDateToMs(b.statusDate) ?? parseCreated(b.createdAt);
    if (ta !== tb) return ta - tb;
    return parseCreated(a.createdAt) - parseCreated(b.createdAt);
  });
  return out;
}

/** Snapshots implied by denormalized columns + raw_payload (Thailand Post batch or single object). */
function snapshotsFromRowColumnsAndPayload(row) {
  const rowBarcode = String(row.barcode ?? "").trim();
  const extra = [];
  const updatedAt =
    row.updated_at instanceof Date
      ? row.updated_at
      : row.updated_at
        ? new Date(row.updated_at)
        : null;
  const createdAtFallback =
    updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt.toISOString() : new Date().toISOString();

  if (rowBarcode && row.status_code != null && String(row.status_code).trim()) {
    const status = String(row.status_code).trim();
    extra.push({
      id: `row-${row.id}-${status}`,
      barcode: rowBarcode,
      status,
      statusDescription: row.status_description != null ? String(row.status_description) : "",
      statusDate: row.status_date_raw != null ? String(row.status_date_raw) : null,
      station: row.station != null ? String(row.station) : null,
      createdAt: createdAtFallback,
    });
  }

  const raw = parseJsonMaybe(row.raw_payload);
  if (!raw) return extra;

  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i++) {
      const n = normalizeItem(raw[i], i, rowBarcode);
      if (n) extra.push(n);
    }
    return extra;
  }

  if (typeof raw === "object") {
    const n = normalizeItem(raw, 0, rowBarcode);
    if (n) {
      if (!n.id || n.id.startsWith("norm-")) {
        n.id = `raw-${row.id}-${crypto.randomUUID().slice(0, 8)}`;
      }
      extra.push(n);
    }
  }
  return extra;
}

async function main() {
  const url = findDatabaseUrl();
  if (!url) {
    console.error("DATABASE_URL not found.");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1 });
  try {
    const rows = await sql`
      select
        id,
        parcel_id,
        barcode,
        status_history,
        status_code,
        status_description,
        status_date_raw,
        station,
        raw_payload,
        updated_at
      from thai_post_webhook_events
    `;
    let n = 0;
    for (const row of rows) {
      const fromHistory = normalizeHistory(row.status_history, row.barcode);
      const fromRow = snapshotsFromRowColumnsAndPayload(row);
      const merged = mergeByDedupe([fromHistory, fromRow]);
      const next = sortCarrierHistory(merged);

      await sql`
        update thai_post_webhook_events
        set status_history = ${sql.json(next)}
        where id = ${row.id}
      `;
      n += 1;
      console.log(
        "Row",
        row.id,
        "(",
        row.barcode,
        ") →",
        next.length,
        "snapshot(s); was",
        fromHistory.length,
        "in history, +",
        fromRow.length,
        "from columns/payload (after dedupe)",
      );
    }
    console.log(n === 0 ? "No rows in thai_post_webhook_events." : `Done. Rewrote ${n} row(s).`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
