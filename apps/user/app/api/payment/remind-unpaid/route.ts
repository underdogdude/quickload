import { and, desc, eq, inArray, isNotNull, notInArray } from "drizzle-orm";
import { getDb, notificationLog, orders, parcels, users } from "@quickload/shared/db";
import { computeOutstanding } from "@quickload/shared/penalty";
import { resolveParcelDisplayCode } from "@quickload/shared/parcel-display-code";
import { NextResponse } from "next/server";
import { pushLineMessage } from "@/lib/line-messaging";
import {
  buildReminderMessage,
  daysRemainingInPaymentWindow,
  daysSinceConfirmed,
  nextDueReminderDay,
  PAYMENT_REMINDER_DAYS,
  reminderTypeForDay,
  type PaymentReminderDay,
} from "@/lib/payment-reminders";

export const dynamic = "force-dynamic";

const EXCLUDED_STATUSES = [
  "canceled",
  "awaiting_actual_weight",
  "draft",
  "registered",
  "paid",
] as const;

const REMINDER_LOG_TYPES = PAYMENT_REMINDER_DAYS.map((d) => reminderTypeForDay(d));

function resolvePublicBaseUrl(): string | null {
  const envBase =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_BASE_URL?.trim() ||
    process.env.PUBLIC_BASE_URL?.trim() ||
    "";
  if (envBase) return envBase.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`.replace(/\/+$/, "");
  return null;
}

function authorizeCron(request: Request): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("[remind-unpaid] CRON_SECRET is not set");
    return NextResponse.json({ ok: false, error: "Not configured" }, { status: 503 });
  }
  const headerSecret = request.headers.get("x-cron-secret")?.trim() ?? "";
  const auth = request.headers.get("authorization")?.trim() ?? "";
  const bearerSecret = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const presented = headerSecret || bearerSecret;
  if (presented !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

type SentReminderMap = Map<string, Set<PaymentReminderDay>>;

function parseReminderDay(type: string): PaymentReminderDay | null {
  const match = /^payment_reminder_day_(1|3|5|7)$/.exec(type);
  if (!match) return null;
  return Number(match[1]) as PaymentReminderDay;
}

async function loadSentReminders(parcelIds: string[]): Promise<SentReminderMap> {
  const map: SentReminderMap = new Map();
  if (parcelIds.length === 0) return map;

  const parcelIdSet = new Set(parcelIds);
  const db = getDb();
  const rows = await db
    .select({ type: notificationLog.type, payload: notificationLog.payload })
    .from(notificationLog)
    .where(
      and(inArray(notificationLog.type, REMINDER_LOG_TYPES), eq(notificationLog.status, "sent")),
    );

  for (const row of rows) {
    const day = parseReminderDay(row.type);
    const parcelId =
      row.payload && typeof row.payload === "object" && "parcelId" in row.payload
        ? String((row.payload as { parcelId?: unknown }).parcelId ?? "")
        : "";
    if (!day || !parcelId || !parcelIdSet.has(parcelId)) continue;
    const set = map.get(parcelId) ?? new Set<PaymentReminderDay>();
    set.add(day);
    map.set(parcelId, set);
  }
  return map;
}

async function runRemindUnpaid() {
  const db = getDb();
  const publicBaseUrl = resolvePublicBaseUrl();
  if (!publicBaseUrl) {
    return NextResponse.json({ ok: false, error: "Missing public base URL" }, { status: 503 });
  }

  const now = new Date();
  const candidates = await db
    .select({
      parcelId: parcels.id,
      userId: parcels.userId,
      barcode: parcels.barcode,
      trackingId: parcels.trackingId,
      price: parcels.price,
      amountPaid: parcels.amountPaid,
      thaiPostPriceConfirmedAt: parcels.thaiPostPriceConfirmedAt,
      lineUserId: users.lineUserId,
    })
    .from(parcels)
    .innerJoin(users, eq(parcels.userId, users.id))
    .where(
      and(
        eq(parcels.isPaid, false),
        isNotNull(parcels.thaiPostPriceConfirmedAt),
        isNotNull(parcels.price),
        isNotNull(users.lineUserId),
        notInArray(parcels.status, [...EXCLUDED_STATUSES]),
      ),
    );

  const parcelIds = candidates.map((c) => c.parcelId);
  const orderMap = new Map<string, { smartpostTrackingcode: string | null }>();
  if (parcelIds.length > 0) {
    const orderRows = await db
      .select({
        parcelId: orders.parcelId,
        smartpostTrackingcode: orders.smartpostTrackingcode,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(inArray(orders.parcelId, parcelIds))
      .orderBy(desc(orders.createdAt));

    for (const row of orderRows) {
      if (!orderMap.has(row.parcelId)) {
        orderMap.set(row.parcelId, { smartpostTrackingcode: row.smartpostTrackingcode });
      }
    }
  }

  const sentReminders = await loadSentReminders(parcelIds);

  const sent: Array<{ parcelId: string; day: PaymentReminderDay; displayCode: string }> = [];
  const skipped: Array<{ parcelId: string; reason: string }> = [];
  const failed: Array<{ parcelId: string; day: PaymentReminderDay; error: string }> = [];

  for (const row of candidates) {
    if (!row.thaiPostPriceConfirmedAt || !row.price || !row.lineUserId) {
      skipped.push({ parcelId: row.parcelId, reason: "missing_required_fields" });
      continue;
    }

    let out;
    try {
      out = computeOutstanding({
        price: String(row.price),
        amountPaid: String(row.amountPaid ?? "0"),
      });
    } catch {
      skipped.push({ parcelId: row.parcelId, reason: "invalid_price" });
      continue;
    }
    if (out.state === "settled" || out.outstanding <= 0) {
      skipped.push({ parcelId: row.parcelId, reason: "settled" });
      continue;
    }

    const daysSince = daysSinceConfirmed(row.thaiPostPriceConfirmedAt, now);
    const alreadySent = sentReminders.get(row.parcelId) ?? new Set<PaymentReminderDay>();
    const day = nextDueReminderDay(daysSince, (d) => alreadySent.has(d));
    if (!day) {
      skipped.push({
        parcelId: row.parcelId,
        reason: daysSince < 1 ? "not_due_yet" : "all_reminders_sent",
      });
      continue;
    }

    const order = orderMap.get(row.parcelId);
    const displayCode = resolveParcelDisplayCode({
      barcode: row.barcode,
      smartpostTrackingcode: order?.smartpostTrackingcode,
      trackingId: row.trackingId,
    });
    const payUrl = new URL(`/pay/${encodeURIComponent(row.parcelId)}`, publicBaseUrl).toString();
    const daysRemaining = daysRemainingInPaymentWindow(row.thaiPostPriceConfirmedAt, 7, now);
    const message = buildReminderMessage(day, {
      parcelId: row.parcelId,
      displayCode,
      amountBaht: out.outstanding,
      payUrl,
      daysRemaining,
    });

    let status: "sent" | "failed" = "sent";
    try {
      await pushLineMessage({ to: row.lineUserId, message });
    } catch (err) {
      status = "failed";
      const msg = err instanceof Error ? err.message : String(err);
      failed.push({ parcelId: row.parcelId, day, error: msg });
    }

    await db.insert(notificationLog).values({
      userId: row.userId,
      lineUserId: row.lineUserId,
      type: reminderTypeForDay(day),
      payload: {
        parcelId: row.parcelId,
        displayCode,
        day,
        daysSinceConfirmed: daysSince,
        daysRemaining,
        outstanding: out.outstanding,
      },
      status,
    });

    if (status === "sent") {
      alreadySent.add(day);
      sentReminders.set(row.parcelId, alreadySent);
      sent.push({ parcelId: row.parcelId, day, displayCode });
    }
  }

  return NextResponse.json({
    ok: true,
    ranAt: now.toISOString(),
    scanned: candidates.length,
    sent,
    skipped,
    failed,
  });
}

export async function GET(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  try {
    return await runRemindUnpaid();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    console.error("[remind-unpaid]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  try {
    return await runRemindUnpaid();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    console.error("[remind-unpaid]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
