import { and, desc, eq, inArray, isNotNull, lte, notInArray } from "drizzle-orm";
import { getDb, notificationLog, orders, parcels, users } from "@quickload/shared/db";
import { computeOutstanding } from "@quickload/shared/penalty";
import { resolveParcelDisplayCode } from "@quickload/shared/parcel-display-code";
import { NextResponse } from "next/server";
import { pushLineMessage } from "@/lib/line-messaging";
import {
  createPaymentReminder1hAfterPriceTextMessage,
  formatPaymentDueDateThBeShort,
  isPaymentReminder1hAfterPriceDue,
  PAYMENT_REMINDER_1H_AFTER_PRICE_MS,
  PAYMENT_REMINDER_1H_AFTER_PRICE_TYPE,
} from "@/lib/payment-reminders";

export const dynamic = "force-dynamic";

const EXCLUDED_STATUSES = [
  "canceled",
  "awaiting_actual_weight",
  "draft",
  "registered",
  "paid",
] as const;

function authorizeCron(request: Request): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("[remind-1h-after-price] CRON_SECRET is not set");
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

async function loadSentParcelIds(parcelIds: string[]): Promise<Set<string>> {
  const sent = new Set<string>();
  if (parcelIds.length === 0) return sent;

  const parcelIdSet = new Set(parcelIds);
  const db = getDb();
  const rows = await db
    .select({ payload: notificationLog.payload })
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.type, PAYMENT_REMINDER_1H_AFTER_PRICE_TYPE),
        eq(notificationLog.status, "sent"),
      ),
    );

  for (const row of rows) {
    const parcelId =
      row.payload && typeof row.payload === "object" && "parcelId" in row.payload
        ? String((row.payload as { parcelId?: unknown }).parcelId ?? "")
        : "";
    if (parcelId && parcelIdSet.has(parcelId)) sent.add(parcelId);
  }
  return sent;
}

async function runRemind1hAfterPrice() {
  const db = getDb();
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - PAYMENT_REMINDER_1H_AFTER_PRICE_MS);
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
        lte(parcels.thaiPostPriceConfirmedAt, oneHourAgo),
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

  const alreadySent = await loadSentParcelIds(parcelIds);

  const sent: Array<{ parcelId: string; displayCode: string }> = [];
  const skipped: Array<{ parcelId: string; reason: string }> = [];
  const failed: Array<{ parcelId: string; error: string }> = [];

  for (const row of candidates) {
    if (!row.thaiPostPriceConfirmedAt || !row.price || !row.lineUserId) {
      skipped.push({ parcelId: row.parcelId, reason: "missing_required_fields" });
      continue;
    }

    if (alreadySent.has(row.parcelId)) {
      skipped.push({ parcelId: row.parcelId, reason: "already_sent" });
      continue;
    }

    if (!isPaymentReminder1hAfterPriceDue(row.thaiPostPriceConfirmedAt, now)) {
      skipped.push({ parcelId: row.parcelId, reason: "not_due_yet" });
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

    const order = orderMap.get(row.parcelId);
    const displayCode = resolveParcelDisplayCode({
      barcode: row.barcode,
      smartpostTrackingcode: order?.smartpostTrackingcode,
      trackingId: row.trackingId,
    });
    const message = createPaymentReminder1hAfterPriceTextMessage({
      displayCode,
      amountBaht: out.outstanding,
      thaiPostPriceConfirmedAt: row.thaiPostPriceConfirmedAt,
    });
    const paymentDueBy = formatPaymentDueDateThBeShort(row.thaiPostPriceConfirmedAt);

    let status: "sent" | "failed" = "sent";
    try {
      await pushLineMessage({ to: row.lineUserId, message });
    } catch (err) {
      status = "failed";
      const msg = err instanceof Error ? err.message : String(err);
      failed.push({ parcelId: row.parcelId, error: msg });
    }

    await db.insert(notificationLog).values({
      userId: row.userId,
      lineUserId: row.lineUserId,
      type: PAYMENT_REMINDER_1H_AFTER_PRICE_TYPE,
      payload: {
        parcelId: row.parcelId,
        displayCode,
        outstanding: out.outstanding,
        paymentDueBy,
        thaiPostPriceConfirmedAt: row.thaiPostPriceConfirmedAt.toISOString(),
      },
      status,
    });

    if (status === "sent") {
      alreadySent.add(row.parcelId);
      sent.push({ parcelId: row.parcelId, displayCode });
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
    return await runRemind1hAfterPrice();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    console.error("[remind-1h-after-price]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  try {
    return await runRemind1hAfterPrice();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    console.error("[remind-1h-after-price]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
