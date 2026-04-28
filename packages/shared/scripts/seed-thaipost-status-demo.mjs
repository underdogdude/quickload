/**
 * Dev-only: delete all parcels (cascades orders, payments, thai_post_webhook_events) for one user,
 * then insert demo rows covering Thailand Post status codes 1–20 + one awaiting_actual_weight row.
 *
 * All narrative/demo parcel content is persisted in **your database** by this script — not returned from app code.
 * Runtime Smartpost/Thai Post **mocks** use JSON under apps/user/lib/dev-mock/payloads/ when NEXT_PUBLIC_SMARTPOST_MOCK=1.
 *
 * Thailand Post webhook shape (per item) matches production-style payloads:
 *   { barcode, status, statusDescription, statusDate, station [, finalcost ] }
 * - status: string digits "1".."20" (same as parseThaiPostStatusCode in app)
 * - statusDate: "DD/MM/YYYY HH:mm:ss" in Asia/Bangkok (e.g. 07/06/2017 08:58:00)
 * - finalcost: optional; when present, mirrors what /api/parcels/thai-post-webhook parseFinalCost reads
 *
 * Usage:
 *   node ./scripts/seed-thaipost-status-demo.mjs --user-id=<uuid>
 *   SEED_USER_ID=<uuid> node ./scripts/seed-thaipost-status-demo.mjs
 *   node ./scripts/seed-thaipost-status-demo.mjs --list-users
 *
 * DATABASE_URL is resolved like apply-sql.mjs (apps/user/.env.local first).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {Record<string, { parcelStatus: string; descriptionTh: string }>} */
const THAI_POST_STATUS_META = {
  "1": { parcelStatus: "pending_payment", descriptionTh: "ปณ.ต้นทางรับฝากแล้ว" },
  "2": { parcelStatus: "delivered", descriptionTh: "นำจ่ายถึงผู้รับแล้ว" },
  "3": { parcelStatus: "in_transit", descriptionTh: "อยู่ระหว่างคัดแยกสินค้า" },
  "4": { parcelStatus: "in_transit", descriptionTh: "ส่งออกจากศูนย์คัดแยกสินค้า/ที่ทำการ" },
  "5": { parcelStatus: "in_transit", descriptionTh: "ถึงศูนย์คัดแยกสินค้า/ที่ทำการ" },
  "6": { parcelStatus: "at_destination_post", descriptionTh: "ถึง ปณ.ปลายทาง เตรียมนำจ่าย" },
  "7": { parcelStatus: "delivered", descriptionTh: "นำจ่าย/ชำระเงินเรียบร้อย" },
  "8": { parcelStatus: "at_destination_post", descriptionTh: "รอจ่าย ณ ที่ทำการไปรษณีย์" },
  "9": { parcelStatus: "in_transit", descriptionTh: "อยู่ในระหว่างการขนส่ง" },
  "10": { parcelStatus: "returning", descriptionTh: "อยู่ในระหว่างส่งคืน" },
  "11": { parcelStatus: "in_transit", descriptionTh: "สแกนเปิดเพื่อส่งต่อ" },
  "12": { parcelStatus: "in_transit", descriptionTh: "สแกนรับเข้าปลายทาง" },
  "13": { parcelStatus: "in_transit", descriptionTh: "สแกนรับมอบ" },
  "14": { parcelStatus: "at_destination_post", descriptionTh: "ออกใบแจ้ง" },
  "15": { parcelStatus: "failed", descriptionTh: "จ่าหน้าไม่ชัดเจน" },
  "16": { parcelStatus: "failed", descriptionTh: "ไม่มีเลขบ้านตามจ่าหน้า" },
  "17": { parcelStatus: "failed", descriptionTh: "ไม่ยอมรับ" },
  "18": { parcelStatus: "failed", descriptionTh: "ไม่มีผู้รับตามจ่าหน้า" },
  "19": { parcelStatus: "failed", descriptionTh: "ไม่มารับตามกำหนด" },
  "20": { parcelStatus: "canceled", descriptionTh: "Drop แล้ว" },
};

/** Realistic sender/recipient snapshots (rotate by parcel index). */
const ADDRESS_PROFILES = [
  {
    shipperName: "นายอรรถพล ใจดี",
    shipperMobile: "081-234-5698",
    shipperEmail: "attapon.j@demo-mail.example",
    shipperAddress: "88/12 อาคารวรรณสิริ ถนนสุขุมวิท 71",
    shipperSub: "แขวงพระโขนงใต้",
    shipperDistrict: "เขตพระโขนง",
    shipperProvince: "กรุงเทพมหานคร",
    shipperZip: "10260",
    firstMileStation: "ฝ่ายรับฝาก ปณ.พระโขนง",
    cusName: "นางสาวญาณิดา วงศ์ใหญ่",
    cusTel: "097-345-2198",
    cusEmail: "yanida.w@demo-mail.example",
    cusAdd: "42 หมู่ 3 ถนนเชียงใหม่-ลำปาง",
    cusSub: "ตำบลฟ้าฮ่าม",
    cusAmp: "อำเภอเมืองเชียงใหม่",
    cusProv: "เชียงใหม่",
    cusZip: "50300",
    destinationSummary: "นางสาวญาณิดา วงศ์ใหญ่ · อ.เมืองเชียงใหม่, เชียงใหม่",
  },
  {
    shipperName: "หจก. ซันไรส์ โลจิสติกส์",
    shipperMobile: "02-718-4490",
    shipperEmail: "shipping@sunrise-log.example",
    shipperAddress: "199 ถนนพระราม 4 ชั้น 8 อาคารไทยซีที",
    shipperSub: "แขวงคลองเตย",
    shipperDistrict: "เขตคลองเตย",
    shipperProvince: "กรุงเทพมหานคร",
    shipperZip: "10110",
    firstMileStation: "ศูนย์ LS สนามบินสุวรรณภูมิ",
    cusName: "นายวีรยุทธ แสงทอง",
    cusTel: "089-771-2044",
    cusEmail: "weerayut.s@demo-mail.example",
    cusAdd: "15/4 ถนนราษฎร์อุทิศ",
    cusSub: "ตำบลหาดใหญ่",
    cusAmp: "อำเภอหาดใหญ่",
    cusProv: "สงขลา",
    cusZip: "90110",
    destinationSummary: "นายวีรยุทธ แสงทอง · อ.หาดใหญ่, สงขลา",
  },
  {
    shipperName: "คุณมณีรัตน์ ศิริพันธุ์",
    shipperMobile: "065-908-1122",
    shipperEmail: "maneerat.s@demo-mail.example",
    shipperAddress: "77/2 ซอยลาดพร้าว 101",
    shipperSub: "แขวงคลองจั่น",
    shipperDistrict: "เขตบางกะปิ",
    shipperProvince: "กรุงเทพมหานคร",
    shipperZip: "10240",
    firstMileStation: "ฝ่ายฝาก ปณ.บางกะปิ",
    cusName: "นางสมหมาย บุญมา",
    cusTel: "044-001-556",
    cusEmail: "sommai.b@demo-mail.example",
    cusAdd: "88 ถนนศรีจันทร์ ใกล้เซ็นทรัลพลาซา",
    cusSub: "ในเมือง",
    cusAmp: "อำเภอเมืองขอนแก่น",
    cusProv: "ขอนแก่น",
    cusZip: "40000",
    destinationSummary: "นางสมหมาย บุญมา · อ.เมืองขอนแก่น, ขอนแก่น",
  },
  {
    shipperName: "ร้านส่งด่วน ดี.ที.เอ็น.",
    shipperMobile: "090-221-8834",
    shipperEmail: "dtexpress@demo-mail.example",
    shipperAddress: "12 ถนนจรัญสนิทวงศ์ แยกบางพลัด",
    shipperSub: "แขวงบางพลัด",
    shipperDistrict: "เขตบางพลัด",
    shipperProvince: "กรุงเทพมหานคร",
    shipperZip: "10700",
    firstMileStation: "ฝ่ายรับฝาก ปณ.บางพลัด",
    cusName: "คุณธนา ปักษ์ใต้",
    cusTel: "076-329-441",
    cusEmail: "thana.p@demo-mail.example",
    cusAdd: "9/1 หมู่บ้านภูเก็ตวิลล่า ถนนวิชัยสงคราม",
    cusSub: "ตำบลตลาดใหญ่",
    cusAmp: "อำเภอเมืองภูเก็ต",
    cusProv: "ภูเก็ต",
    cusZip: "83000",
    destinationSummary: "คุณธนา ปักษ์ใต้ · อ.เมืองภูเก็ต, ภูเก็ต",
  },
];

const PARCEL_KINDS = [
  { parcelType: "เอกสารสำคัญ", productInbox: "E", serviceType: "EMS", size: "32x23x2cm" },
  { parcelType: "พัสดุทั่วไป", productInbox: "M", serviceType: "EMS", size: "28x20x12cm" },
  { parcelType: "ของใช้ในบ้าน", productInbox: "M", serviceType: "EMS", size: "35x25x18cm" },
  { parcelType: "อุปกรณ์อิเล็กทรอนิกส์", productInbox: "M", serviceType: "EMS", size: "22x18x10cm" },
];

/** Main processing / destination ปณ. by scenario index — names like real signage. */
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

function argValue(name) {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : null;
}

const LIST_USERS = process.argv.includes("--list-users");
const userIdArg = argValue("user-id") || process.env.SEED_USER_ID?.trim() || null;

/** Thailand Post item id style: `WB` + 9 digits + `TH` = 13 characters (e.g. WB222126989TH). */
function thaiPostBarcodeNineDigit(n) {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x) || x < 0 || x > 999_999_999) {
    throw new Error(`thaiPostBarcodeNineDigit: need 0..999999999, got ${n}`);
  }
  return `WB${String(x).padStart(9, "0")}TH`;
}

/** DD/MM/YYYY HH:mm:ss — Thailand Post style, Asia/Bangkok. */
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

function findUserId() {
  const url = findDatabaseUrl();
  if (!url) {
    console.error("DATABASE_URL not found.");
    process.exit(1);
  }
  return url;
}

async function listUsers(sql) {
  const rows = await sql`
    select id, line_user_id, display_name, coalesce(first_name,'') || ' ' || coalesce(last_name,'') as name
    from users
    order by created_at desc
    limit 30
  `;
  console.log("Users (latest 30):");
  for (const r of rows) {
    console.log(`  ${r.id}  line:${r.line_user_id}  ${(r.display_name || r.name || "").trim()}`);
  }
}

/**
 * Which seeded rows are fully paid (inserts a succeeded payment; trigger updates amount_paid).
 * @type {Set<number>}
 */
const PAID_CODES = new Set([2, 8, 9]);

function profileForIndex(i) {
  return ADDRESS_PROFILES[i % ADDRESS_PROFILES.length];
}

function parcelKindForIndex(i) {
  return PARCEL_KINDS[i % PARCEL_KINDS.length];
}

function mainStationForCode(n) {
  return MAIN_STATIONS[(n - 1) % MAIN_STATIONS.length];
}

async function main() {
  const url = findUserId();
  const sql = postgres(url, { max: 1 });

  try {
    if (LIST_USERS) {
      await listUsers(sql);
      return;
    }

    if (!userIdArg) {
      console.error("Missing --user-id=<uuid> or SEED_USER_ID. Use --list-users to pick one.");
      process.exit(1);
    }

    const [u] = await sql`select id from users where id = ${userIdArg}::uuid limit 1`;
    if (!u) {
      console.error(`No user with id ${userIdArg}`);
      process.exit(1);
    }

    const now = new Date();
    const stamp = now.toISOString().slice(0, 10).replace(/-/g, "");

    await sql.begin(async (tx) => {
      const deleted = await tx`
        delete from parcels where user_id = ${userIdArg}::uuid returning id
      `;
      console.log(`Deleted ${deleted.length} existing parcel(s) for user ${userIdArg}.`);

      /** @type {{ parcelId: string; code: string; paid: boolean; price: string | null }[]} */
      const created = [];

      const awaitingProfile = profileForIndex(0);
      const awaitingKind = parcelKindForIndex(0);

      // --- Awaiting actual weight (no Thai Post code yet) ---
      const awaitingId = crypto.randomUUID();
      const awaitingTrackNine = String(100_000_000 + Math.floor(Math.random() * 899_999_999)).padStart(9, "0").slice(0, 9);
      const awaitingTracking = `SP${awaitingTrackNine}TH`;
      const awaitingBarcode = thaiPostBarcodeNineDigit(0);
      await tx`
        insert into parcels (
          id, tracking_id, barcode, user_id, destination, weight_kg, size, parcel_type,
          status, price, is_paid, source, penalty_clock_started_at, amount_paid,
          thai_post_price_confirmed_at, created_at, updated_at
        ) values (
          ${awaitingId}::uuid,
          ${awaitingTracking},
          ${awaitingBarcode},
          ${userIdArg}::uuid,
          ${`${awaitingProfile.destinationSummary} · รอน้ำหนักจริงจากที่ทำการ`},
          ${"0.485"},
          ${awaitingKind.size},
          ${awaitingKind.parcelType},
          ${"awaiting_actual_weight"},
          null,
          false,
          ${"seed:thaipost-demo"},
          null,
          ${"0"},
          null,
          ${now},
          ${now}
        )
      `;
      const awaitingRef = `REF-${stamp}-AWT-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
      await tx`
        insert into orders (
          parcel_id, user_id, statuscode, message, smartpost_trackingcode, barcode,
          service_type, product_inbox, product_weight, product_price,
          shipper_name, shipper_address, shipper_subdistrict, shipper_district, shipper_province, shipper_zipcode,
          shipper_email, shipper_mobile,
          cus_name, cus_add, cus_sub, cus_amp, cus_prov, cus_zipcode, cus_tel, cus_email,
          customer_code, cost, finalcost, order_status, items, insurance_rate_price, reference_id,
          created_at, updated_at
        ) values (
          ${awaitingId}::uuid,
          ${userIdArg}::uuid,
          ${"201"},
          ${"สร้างรายการสำเร็จ (รอน้ำหนักจริง)"},
          ${awaitingTracking},
          ${awaitingBarcode},
          ${awaitingKind.serviceType},
          ${awaitingKind.productInbox},
          ${"485"},
          ${"0"},
          ${awaitingProfile.shipperName},
          ${awaitingProfile.shipperAddress},
          ${awaitingProfile.shipperSub},
          ${awaitingProfile.shipperDistrict},
          ${awaitingProfile.shipperProvince},
          ${awaitingProfile.shipperZip},
          ${awaitingProfile.shipperEmail},
          ${awaitingProfile.shipperMobile},
          ${awaitingProfile.cusName},
          ${awaitingProfile.cusAdd},
          ${awaitingProfile.cusSub},
          ${awaitingProfile.cusAmp},
          ${awaitingProfile.cusProv},
          ${awaitingProfile.cusZip},
          ${awaitingProfile.cusTel},
          ${awaitingProfile.cusEmail},
          ${`CUS-${stamp.slice(2)}-88291`},
          ${"87.50"},
          ${"87.50"},
          ${"ACCEPTED:awaiting_branch_weigh"},
          ${awaitingKind.parcelType},
          ${"0"},
          ${awaitingRef},
          ${now},
          ${now}
        )
      `;

      for (let n = 1; n <= 20; n += 1) {
        const code = String(n);
        const meta = THAI_POST_STATUS_META[code];
        const parcelId = crypto.randomUUID();
        const profile = profileForIndex(n);
        const kind = parcelKindForIndex(n);
        const trackCore = String((880_000_000 + n * 1_337) % 1_000_000_000).padStart(9, "0");
        const trackingId = `SP${trackCore}TH`;
        const barcode = thaiPostBarcodeNineDigit(n);
        const isCanceled = meta.parcelStatus === "canceled";
        const priceVal = isCanceled ? null : (52 + n * 4.25).toFixed(2);
        const confirmedAt = isCanceled ? null : now;
        const willPayAfterSeed = PAID_CODES.has(n);
        const mainStation = mainStationForCode(n);
        const referenceId = `REF-${stamp}-${String(n).padStart(2, "0")}-${crypto.randomUUID().replace(/-/g, "").slice(0, 6)}`;
        const weightG = 420 + n * 18;
        const productPriceIns = n % 3 === 0 ? "3500" : "0";
        const insuranceLine = n % 3 === 0 ? "35" : "0";

        await tx`
          insert into parcels (
            id, tracking_id, barcode, user_id, destination, weight_kg, size, parcel_type,
            status, price, is_paid, source, penalty_clock_started_at, amount_paid,
            thai_post_price_confirmed_at, created_at, updated_at
          ) values (
            ${parcelId}::uuid,
            ${trackingId},
            ${barcode},
            ${userIdArg}::uuid,
            ${`${profile.destinationSummary} · ${meta.descriptionTh}`},
            ${(weightG / 1000).toFixed(3)},
            ${kind.size},
            ${kind.parcelType},
            ${meta.parcelStatus},
            ${priceVal},
            false,
            ${"seed:thaipost-demo"},
            null,
            ${"0"},
            ${confirmedAt},
            ${now},
            ${now}
          )
        `;

        await tx`
          insert into orders (
            parcel_id, user_id, statuscode, message, smartpost_trackingcode, barcode,
            service_type, product_inbox, product_weight, product_price,
            shipper_name, shipper_address, shipper_subdistrict, shipper_district, shipper_province, shipper_zipcode,
            shipper_email, shipper_mobile,
            cus_name, cus_add, cus_sub, cus_amp, cus_prov, cus_zipcode, cus_tel, cus_email,
            customer_code, cost, finalcost, order_status, items, insurance_rate_price, reference_id,
            created_at, updated_at
          ) values (
            ${parcelId}::uuid,
            ${userIdArg}::uuid,
            ${"201"},
            ${"สร้างรายการสำเร็จ"},
            ${trackingId},
            ${barcode},
            ${kind.serviceType},
            ${kind.productInbox},
            ${String(weightG)},
            ${productPriceIns},
            ${profile.shipperName},
            ${profile.shipperAddress},
            ${profile.shipperSub},
            ${profile.shipperDistrict},
            ${profile.shipperProvince},
            ${profile.shipperZip},
            ${profile.shipperEmail},
            ${profile.shipperMobile},
            ${profile.cusName},
            ${profile.cusAdd},
            ${profile.cusSub},
            ${profile.cusAmp},
            ${profile.cusProv},
            ${profile.cusZip},
            ${profile.cusTel},
            ${profile.cusEmail},
            ${`CUS-${stamp.slice(2)}-${String(9100 + n)}`},
            ${priceVal ?? "0"},
            ${priceVal ?? "0"},
            ${`${code}:${meta.descriptionTh}`},
            ${kind.parcelType},
            ${insuranceLine},
            ${referenceId},
            ${now},
            ${now}
          )
        `;

        /**
         * Always include an earlier "รับฝาก" (code 1) snapshot, then the parcel's scenario code.
         * For scenario `n === 1` both entries are code "1" with different times so `status_history`
         * still has multiple rows (matches real multi-scan timelines).
         */
        const webhookEvents = [];
        const tReceive = now.getTime() + (-180 - n * 12) * 60_000;
        webhookEvents.push({
          statusCode: "1",
          description: THAI_POST_STATUS_META["1"].descriptionTh,
          statusDateRaw: thaiPostStatusDateFromMs(tReceive),
          station: profile.firstMileStation,
          rawPayload: {
            barcode,
            status: "1",
            statusDescription: THAI_POST_STATUS_META["1"].descriptionTh,
            statusDate: thaiPostStatusDateFromMs(tReceive),
            station: profile.firstMileStation,
          },
          createdAt: new Date(now.getTime() - (210 + n) * 60_000),
        });
        const tMain = now.getTime() + n * 17 * 60_000;
        const rawPayload = {
          barcode,
          status: code,
          statusDescription: meta.descriptionTh,
          statusDate: thaiPostStatusDateFromMs(tMain),
          station: mainStation,
          ...(priceVal
            ? {
                finalcost: priceVal,
                finalCost: priceVal,
                cost: priceVal,
              }
            : {}),
        };
        webhookEvents.push({
          statusCode: code,
          description: meta.descriptionTh,
          statusDateRaw: thaiPostStatusDateFromMs(tMain),
          station: mainStation,
          rawPayload,
          createdAt: new Date(now.getTime() - (45 + n) * 60_000),
        });

        const historyEntries = webhookEvents.map((ev) => ({
          id: crypto.randomUUID(),
          barcode,
          status: ev.statusCode,
          statusDescription: ev.description,
          statusDate: ev.statusDateRaw,
          station: ev.station,
          createdAt: ev.createdAt.toISOString(),
        }));
        const lastEv = webhookEvents[webhookEvents.length - 1];
        const firstCreated = webhookEvents[0].createdAt;
        const lastCreated = lastEv.createdAt;
        await tx`
          insert into thai_post_webhook_events (
            parcel_id, barcode, status_code, status_description, status_date_raw, station,
            status_history, raw_payload, created_at, updated_at
          ) values (
            ${parcelId}::uuid,
            ${barcode},
            ${lastEv.statusCode},
            ${lastEv.description},
            ${lastEv.statusDateRaw},
            ${lastEv.station},
            ${sql.json(historyEntries)},
            ${sql.json(lastEv.rawPayload)},
            ${firstCreated},
            ${lastCreated}
          )
        `;

        created.push({ parcelId, code, paid: willPayAfterSeed, price: priceVal });
      }

      const paidAt = new Date(now.getTime() + 30_000);
      for (const row of created) {
        if (!row.paid || !row.price) continue;
        const amt = row.price;
        const paymentId = crypto.randomUUID();
        await tx`
          insert into payments (
            id, parcel_id, user_id, provider, provider_charge_id, amount, currency,
            payment_method, status, qr_payload, expires_at, paid_at,
            raw_webhook_payload,
            created_at, updated_at
          ) values (
            ${paymentId}::uuid,
            ${row.parcelId}::uuid,
            ${userIdArg}::uuid,
            ${"beam"},
            ${`ch_live_${stamp}_${row.code}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`},
            ${amt},
            ${"THB"},
            ${"promptpay"},
            ${"succeeded"},
            null,
            null,
            ${paidAt},
            ${sql.json({
              object: "charge",
              id: `ch_seed_${row.code}`,
              status: "succeeded",
              amount: Math.round(Number(amt) * 100),
              currency: "thb",
              source: "seed-thaipost-status-demo",
            })},
            ${now},
            ${paidAt}
          )
        `;
      }

      for (const row of created) {
        if (!row.paid || !row.price) continue;
        await tx`
          update parcels
          set is_paid = true,
              status = case when status in ('pending_payment', 'registered') then 'paid' else status end,
              updated_at = ${paidAt}
          where id = ${row.parcelId}::uuid
        `;
      }
    });

    console.log("Seed complete.");
    console.log("  + 1 row: awaiting_actual_weight — full Thai addresses / EMS snapshot, WB000000000TH.");
    console.log("  + 20 rows: codes 1–20; WB000000001TH … WB000000020TH; SP…TH tracking; 2 webhook events when code≠1.");
    console.log("  + Paid (Beam-style): codes " + [...PAID_CODES].sort((a, b) => a - b).join(", "));
    console.log("  + Code 20: canceled, no price / confirm.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
