import { getDb, ishipPickupRequests, ishipPickupWebhookLogs } from "@quickload/shared/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  resolveIshipWebhookLifecycleTimestamps,
  resolveIshipWebhookStatus,
  resolveMonotonicPickupStatus,
  type IshipPickupStatus,
} from "@/lib/iship";
import { verifyIshipRelaySignature } from "@/lib/iship-relay-auth";

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function valueFrom(records: Array<Record<string, unknown> | null>, keys: string[]): unknown {
  for (const record of records) {
    if (!record) continue;
    for (const key of keys) {
      if (record[key] !== null && record[key] !== undefined && String(record[key]).trim()) return record[key];
    }
  }
  return null;
}

function text(value: unknown): string | null {
  if (value === null || value === undefined || typeof value === "boolean") return null;
  const normalized = String(value).trim();
  return normalized || null;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const relaySecret = process.env.ISHIP_RELAY_SHARED_SECRET?.trim() || "";
  if (!relaySecret) {
    return NextResponse.json({ ok: false, error: "Webhook relay is not configured" }, { status: 503 });
  }
  const timestamp = request.headers.get("x-smartpost-timestamp")?.trim() || "";
  const signature = request.headers.get("x-smartpost-signature")?.trim() || "";
  if (!verifyIshipRelaySignature({ rawBody, timestamp, signature, secret: relaySecret })) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const root = recordOf(payload);
  if (!root) return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  const data = recordOf(root.data);
  const records = [data, root];
  const ticketPickupId = text(
    valueFrom(records, [
      "ticketPickupId",
      "ticket_pickup_id",
      "currentTicketPickupId",
      "current_ticket_pickup_id",
      "ticketId",
    ]),
  );
  const rawStatusCode = valueFrom(records, ["status", "statusCode", "status_code", "courierStatus"]);
  const rawStatusText = valueFrom(records, ["status_text", "statusText", "status_desc", "statusDescription"]);
  const staffInfoName = text(
    valueFrom(records, ["staffInfoName", "staff_info_name", "staffName", "driverName"]),
  );
  const staffInfoPhone = text(
    valueFrom(records, ["staffInfoPhone", "staff_info_phone", "staffPhone", "driverPhone"]),
  );
  const timeoutAtText = text(valueFrom(records, ["timeoutAtText", "timeout_at_text"]));
  const ticketMessage = text(valueFrom(records, ["ticketMessage", "ticket_message", "message", "msg"]));
  const rawAcceptedAt = valueFrom(records, ["accepted_at", "acceptedAt"]);
  const rawClosedAt = valueFrom(records, ["closed_at", "closedAt"]);

  const db = getDb();
  if (!ticketPickupId) {
    await db.insert(ishipPickupWebhookLogs).values({
      authenticated: true,
      processed: false,
      outcome: "missing_ticket",
      rawPayload: payload,
    });
    return NextResponse.json({ ok: false, error: "ticketPickupId is required" }, { status: 400 });
  }

  const [pickup] = await db
    .select()
    .from(ishipPickupRequests)
    .where(eq(ishipPickupRequests.ishipTicketPickupId, ticketPickupId))
    .limit(1);
  if (!pickup) {
    await db.insert(ishipPickupWebhookLogs).values({
      ticketPickupId,
      authenticated: true,
      processed: false,
      outcome: "ticket_not_found",
      rawPayload: payload,
    });
    return NextResponse.json(
      { ok: true, matched: false, updated: false, retryable: true },
      { status: 202 },
    );
  }

  const incoming = resolveIshipWebhookStatus(rawStatusCode, rawStatusText);
  const nextStatus = resolveMonotonicPickupStatus(pickup.status as IshipPickupStatus, incoming);
  const now = new Date();
  const lifecycleTimestamps = resolveIshipWebhookLifecycleTimestamps({
    acceptedAt: rawAcceptedAt,
    closedAt: rawClosedAt,
    currentClosedAt: pickup.closedAt,
    nextStatus,
    receivedAt: now,
  });
  const patch: Partial<typeof ishipPickupRequests.$inferInsert> = {
    status: nextStatus,
    ishipStatusCode: text(rawStatusCode),
    ishipStatusText: text(rawStatusText),
    updatedAt: now,
  };
  if (staffInfoName) patch.staffInfoName = staffInfoName;
  if (staffInfoPhone) patch.staffInfoPhone = staffInfoPhone;
  if (timeoutAtText) patch.timeoutAtText = timeoutAtText;
  if (ticketMessage) patch.ticketMessage = ticketMessage;
  if (lifecycleTimestamps.acceptedAt) patch.acceptedAt = lifecycleTimestamps.acceptedAt;
  if (lifecycleTimestamps.closedAt) patch.closedAt = lifecycleTimestamps.closedAt;
  if (nextStatus === "cancelled") patch.cancelledAt = pickup.cancelledAt ?? now;

  await db.transaction(async (tx) => {
    await tx.update(ishipPickupRequests).set(patch).where(eq(ishipPickupRequests.id, pickup.id));
    await tx.insert(ishipPickupWebhookLogs).values({
      ticketPickupId,
      pickupRequestId: pickup.id,
      authenticated: true,
      processed: true,
      outcome: incoming ? `status:${nextStatus}` : "no_status_change",
      rawPayload: payload,
    });
  });

  return NextResponse.json({ ok: true, matched: true, updated: true, status: nextStatus });
}
