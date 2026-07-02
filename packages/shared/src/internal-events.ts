import { createHash } from "node:crypto";

import { internalEvents } from "./db/schema";
import { getDb } from "./db";

export type InternalEventType =
  | "payment.received"
  | "parcel.created"
  | "user.registered"
  | "system.error";

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
