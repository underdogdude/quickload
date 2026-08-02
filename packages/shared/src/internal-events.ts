import { createHash } from "node:crypto";

import { internalEvents } from "./db/schema";
import { getDb } from "./db";

export type InternalEventType =
  | "payment.received"
  | "parcel.created"
  | "pickup.lifecycle"
  | "user.registered"
  | "system.error";

export type PickupLifecycleAction =
  | "requested"
  | "request_failed"
  | "request_unknown"
  | "assigned"
  | "picked_up"
  | "cancelled"
  | "cancel_failed"
  | "cancel_sync_failed";

type JsonPayload = Record<string, unknown>;

export async function recordInternalEvent(
  type: InternalEventType,
  eventKey: string,
  payload?: JsonPayload,
): Promise<void> {
  try {
    const normalizedKey = eventKey.trim();
    if (!normalizedKey) return;
    await getDb()
      .insert(internalEvents)
      .values({
        type,
        eventKey: normalizedKey,
        payload: payload ?? null,
        status: "pending",
        nextAttemptAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing({ target: internalEvents.eventKey });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn("[internal-events] record failed:", msg);
  }
}

export async function recordPickupLifecycleEvent(input: {
  pickupRequestId: string;
  action: PickupLifecycleAction;
  source: "customer" | "provider" | "quickload";
  /** Override only for retryable actions that may legitimately occur more than once. */
  dedupeKey?: string;
  ticketPickupId?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  providerMessage?: string | null;
}): Promise<void> {
  const pickupRequestId = input.pickupRequestId.trim();
  if (!pickupRequestId) return;
  const suffix = input.dedupeKey?.trim() || input.action;
  await recordInternalEvent(
    "pickup.lifecycle",
    `pickup.lifecycle:${pickupRequestId}:${suffix}`,
    {
      pickupRequestId,
      action: input.action,
      source: input.source,
      ticketPickupId: input.ticketPickupId ?? null,
      failureCode: input.failureCode ?? null,
      failureMessage: input.failureMessage ?? null,
      providerMessage: input.providerMessage ?? null,
    },
  );
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function systemErrorEventKey(input: {
  source: string;
  message: string;
  at?: Date;
}): string {
  const at = input.at ?? new Date();
  const hour = at.toISOString().slice(0, 13);
  return `system.error:${input.source}:${shortHash(input.message)}:${hour}`;
}

export async function recordSystemErrorEvent(input: {
  source: string;
  error: unknown;
  severity?: "warning" | "critical";
  context?: JsonPayload;
}): Promise<void> {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  const stack = input.error instanceof Error ? input.error.stack : undefined;
  await recordInternalEvent("system.error", systemErrorEventKey({ source: input.source, message }), {
    source: input.source,
    severity: input.severity ?? "critical",
    message,
    stack: stack ? stack.slice(0, 1800) : null,
    context: input.context ?? null,
  });
}
