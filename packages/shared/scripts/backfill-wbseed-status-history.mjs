/**
 * Fix `thai_post_webhook_events.status_history` for demo barcodes `WBSEED##TH`:
 * ensures at least two carrier snapshots (รับฝาก code 1 + current scenario), matching seed intent.
 *
 *   cd packages/shared && pnpm db:backfill:wbseed-history
 *
 * Safe for dev/demo only — do not run on production customer data unless barcodes follow this pattern.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {Record<string, { descriptionTh: string }>} */
const THAI_POST_STATUS_META = {
  "1": { descriptionTh: "ปณ.ต้นทางรับฝากแล้ว" },
  "2": { descriptionTh: "นำจ่ายถึงผู้รับแล้ว" },
  "3": { descriptionTh: "อยู่ระหว่างคัดแยกสินค้า" },
  "4": { descriptionTh: "ส่งออกจากศูนย์คัดแยกสินค้า/ที่ทำการ" },
  "5": { descriptionTh: "ถึงศูนย์คัดแยกสินค้า/ที่ทำการ" },
  "6": { descriptionTh: "ถึง ปณ.ปลายทาง เตรียมนำจ่าย" },
  "7": { descriptionTh: "นำจ่าย/ชำระเงินเรียบร้อย" },
  "8": { descriptionTh: "รอจ่าย ณ ที่ทำการไปรษณีย์" },
  "9": { descriptionTh: "อยู่ในระหว่างการขนส่ง" },
  "10": { descriptionTh: "อยู่ในระหว่างส่งคืน" },
  "11": { descriptionTh: "สแกนเปิดเพื่อส่งต่อ" },
  "12": { descriptionTh: "สแกนรับเข้าปลายทาง" },
  "13": { descriptionTh: "สแกนรับมอบ" },
  "14": { descriptionTh: "ออกใบแจ้ง" },
  "15": { descriptionTh: "จ่าหน้าไม่ชัดเจน" },
  "16": { descriptionTh: "ไม่มีเลขบ้านตามจ่าหน้า" },
  "17": { descriptionTh: "ไม่ยอมรับ" },
  "18": { descriptionTh: "ไม่มีผู้รับตามจ่าหน้า" },
  "19": { descriptionTh: "ไม่มารับตามกำหนด" },
  "20": { descriptionTh: "Drop แล้ว" },
};

const ADDRESS_PROFILES = [
  { firstMileStation: "ฝ่ายรับฝาก ปณ.พระโขนง" },
  { firstMileStation: "ศูนย์ LS สนามบินสุวรรณภูมิ" },
  { firstMileStation: "ฝ่ายฝาก ปณ.บางกะปิ" },
  { firstMileStation: "ฝ่ายรับฝาก ปณ.บางพลัด" },
];

const MAIN_STATIONS = [
  "ศูนย์คัดแยกสินค้า บางนา",
  "ศป. นครสวรรค์",
  "ศูนย์ LS ดอนเมือง",
  "ฝ่ายฝาก ปณ.เชียงใหม่ รัตนโกสินทร์",
  "ฝ่ายฝาก ปณ.หาดใหญ่",
  "ศูนย์คัดแยกสินค้า ขอนแก่น",
  "ฝ่ายฝาก ปณ.ภูเก็ต",
  "กรุงเทพฯ ปณ. กลาง (คลองตัน)",
  "ฝ่ายนำจ่าย ปณ.ลาดพร้าว",
  "ศูนย์ LS สนามบินสุวรรณภูมิ",
  "ฝ่ายรับฝาก ปณ.บางเขน",
  "ฝ่ายฝาก ปณ.สารภี",
  "ศป. ชุมแพ",
  "ฝ่ายนำจ่าย ปณ.เมืองขอนแก่น",
  "ฝ่ายฝาก ปณ.ป่าตอง",
];

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

function thaiPostStatusDateFromMs(ms) {
  const d = new Date(ms);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .filter((x) => x.type !== "literal")
      .map((x) => [x.type, x.value]),
  );
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function parseHistoryArray(raw) {
  if (raw == null) return [];
  let a = raw;
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
  return Array.isArray(a) ? a : [];
}

function lastSnapshotFromHistory(arr, barcode) {
  if (arr.length === 0) return null;
  const last = arr[arr.length - 1];
  if (!last || typeof last !== "object") return null;
  const o = last;
  const status =
    typeof o.status === "string"
      ? o.status.trim()
      : typeof o.statusCode === "string"
        ? o.statusCode.trim()
        : null;
  if (!status) return null;
  const statusDescription =
    o.statusDescription != null
      ? String(o.statusDescription)
      : o.description != null
        ? String(o.description)
        : "";
  const statusDate =
    o.statusDate != null ? String(o.statusDate) : o.statusDateRaw != null ? String(o.statusDateRaw) : null;
  const station = o.station == null ? null : String(o.station);
  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : crypto.randomUUID();
  let createdAt =
    typeof o.createdAt === "string" && o.createdAt.trim() ? o.createdAt.trim() : new Date().toISOString();
  return { id, barcode: String(barcode), status, statusDescription, statusDate, station, createdAt };
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
        barcode,
        status_history,
        status_code,
        status_description,
        status_date_raw,
        station
      from thai_post_webhook_events
      where barcode ~ '^WBSEED[0-9]+TH$'
    `;
    let n = 0;
    for (const row of rows) {
      const m = String(row.barcode).match(/^WBSEED(\d+)TH$/i);
      if (!m) continue;
      const scenario = Math.min(20, Math.max(1, parseInt(m[1], 10)));
      const scenarioKey = String(scenario);
      const metaScenario = THAI_POST_STATUS_META[scenarioKey] ?? THAI_POST_STATUS_META["1"];
      const meta1 = THAI_POST_STATUS_META["1"];

      const arr = parseHistoryArray(row.status_history);
      const last = lastSnapshotFromHistory(arr, row.barcode);

      const endMs =
        thaiPostStatusDateToMs(last?.statusDate) ??
        thaiPostStatusDateToMs(row.status_date_raw != null ? String(row.status_date_raw) : null) ??
        Date.now();
      const startMs = endMs - (35 + scenario * 2) * 60 * 1000;

      const firstMileStation = ADDRESS_PROFILES[scenario % ADDRESS_PROFILES.length].firstMileStation;
      const mainStation = MAIN_STATIONS[(scenario - 1) % MAIN_STATIONS.length];

      const first = {
        id: crypto.randomUUID(),
        barcode: row.barcode,
        status: "1",
        statusDescription: meta1.descriptionTh,
        statusDate: thaiPostStatusDateFromMs(startMs),
        station: firstMileStation,
        createdAt: new Date(startMs).toISOString(),
      };

      let second;
      if (scenarioKey !== "1") {
        second = {
          id: last?.id ?? crypto.randomUUID(),
          barcode: row.barcode,
          status: scenarioKey,
          statusDescription: last?.statusDescription || row.status_description || metaScenario.descriptionTh,
          statusDate:
            last?.statusDate ||
            (row.status_date_raw != null ? String(row.status_date_raw) : null) ||
            thaiPostStatusDateFromMs(endMs),
          station: last?.station || row.station || mainStation,
          createdAt: last?.createdAt || new Date(endMs).toISOString(),
        };
      } else {
        second = {
          id: last?.id ?? crypto.randomUUID(),
          barcode: row.barcode,
          status: "1",
          statusDescription: last?.statusDescription || row.status_description || meta1.descriptionTh,
          statusDate:
            last?.statusDate ||
            (row.status_date_raw != null ? String(row.status_date_raw) : null) ||
            thaiPostStatusDateFromMs(endMs),
          station: last?.station || row.station || firstMileStation,
          createdAt: last?.createdAt || new Date(endMs).toISOString(),
        };
      }

      const next = [first, second].sort((a, b) => {
        const ta = thaiPostStatusDateToMs(a.statusDate) ?? 0;
        const tb = thaiPostStatusDateToMs(b.statusDate) ?? 0;
        return ta - tb;
      });

      await sql`
        update thai_post_webhook_events
        set status_history = ${sql.json(next)}
        where id = ${row.id}
      `;
      n += 1;
      console.log(row.barcode, "→", next.length, "snapshots");
    }
    console.log(n === 0 ? "No WBSEED… rows to update." : `Updated ${n} row(s).`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
