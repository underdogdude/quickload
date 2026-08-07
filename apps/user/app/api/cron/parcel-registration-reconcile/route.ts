import { and, inArray, lte } from "drizzle-orm";
import { getDb, parcelRegistrationAttempts } from "@quickload/shared/db";
import { recordSystemErrorEvent } from "@quickload/shared/internal-events";
import { NextResponse } from "next/server";
import {
  persistProviderSucceededAttemptWithRetry,
  RegistrationPersistenceError,
} from "@/lib/parcel-registration-persistence";

export const dynamic = "force-dynamic";

const STALE_SUBMISSION_MS = 2 * 60 * 1000;
const SUPPORT_RECHECK_MS = 15 * 60 * 1000;
const MAX_BATCH_SIZE = 100;

function authorizeCron(request: Request): NextResponse | null {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    console.error("[parcel-registration.reconcile] CRON_SECRET is not set");
    return NextResponse.json({ ok: false, error: "Not configured" }, { status: 503 });
  }
  const headerSecret = request.headers.get("x-cron-secret")?.trim() ?? "";
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (headerSecret !== expected && bearer !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

async function runReconcile() {
  const db = getDb();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_SUBMISSION_MS);
  const candidates = await db
    .select()
    .from(parcelRegistrationAttempts)
    .where(
      and(
        inArray(parcelRegistrationAttempts.status, ["provider_succeeded", "submitting", "unknown"]),
        lte(parcelRegistrationAttempts.nextReconcileAt, now),
      ),
    )
    .limit(MAX_BATCH_SIZE);

  // Fresh `submitting` rows have no nextReconcileAt yet. Pull stale ones in a
  // separate query so a server crash before the provider outcome write cannot
  // remain invisible forever.
  const staleSubmitting = await db
    .select()
    .from(parcelRegistrationAttempts)
    .where(
      and(
        inArray(parcelRegistrationAttempts.status, ["submitting"]),
        lte(parcelRegistrationAttempts.updatedAt, staleBefore),
      ),
    )
    .limit(MAX_BATCH_SIZE);

  const byId = new Map([...candidates, ...staleSubmitting].map((row) => [row.id, row]));
  let recovered = 0;
  let quarantined = 0;
  let needsSupport = 0;
  let errors = 0;

  for (const attempt of byId.values()) {
    try {
      if (attempt.status === "provider_succeeded") {
        await persistProviderSucceededAttemptWithRetry(attempt.id);
        recovered += 1;
        continue;
      }

      if (attempt.status === "submitting") {
        const [updated] = await db
          .update(parcelRegistrationAttempts)
          .set({
            status: "unknown",
            retryable: false,
            lastError: "Server stopped before the SmartPost outcome was durably recorded",
            nextReconcileAt: new Date(now.getTime() + SUPPORT_RECHECK_MS),
            updatedAt: now,
          })
          .where(
            and(
              inArray(parcelRegistrationAttempts.id, [attempt.id]),
              inArray(parcelRegistrationAttempts.status, ["submitting"]),
            ),
          )
          .returning({ id: parcelRegistrationAttempts.id });
        if (updated) {
          quarantined += 1;
          await recordSystemErrorEvent({
            source: "parcel.registration.reconcile-stale-submission",
            severity: "critical",
            error: new Error("Ambiguous SmartPost registration requires provider lookup"),
            dedupeKey: `${attempt.id}:stale-submission`,
            context: {
              registrationAttemptId: attempt.id,
              referenceId: attempt.referenceId,
            },
          });
        }
        continue;
      }

      // Unknown means a transport timeout or a process death around the carrier
      // boundary. Never call addItem again. Keep surfacing it for provider/manual
      // lookup by the stable referenceId.
      needsSupport += 1;
      await db
        .update(parcelRegistrationAttempts)
        .set({ nextReconcileAt: new Date(now.getTime() + SUPPORT_RECHECK_MS), updatedAt: now })
        .where(inArray(parcelRegistrationAttempts.id, [attempt.id]));
      await recordSystemErrorEvent({
        source: "parcel.registration.reconcile-unknown",
        severity: "critical",
        error: new Error("Ambiguous SmartPost result must be looked up; addItem will not be retried"),
        dedupeKey: `${attempt.id}:unknown`,
        context: {
          registrationAttemptId: attempt.id,
          referenceId: attempt.referenceId,
        },
      });
    } catch (error) {
      errors += 1;
      const requiresSupport =
        error instanceof RegistrationPersistenceError &&
        ["missing_barcode", "conflict", "invalid_snapshot"].includes(error.code);
      if (requiresSupport) needsSupport += 1;
      await db
        .update(parcelRegistrationAttempts)
        .set({
          lastError: error instanceof Error ? error.message : String(error),
          nextReconcileAt: new Date(now.getTime() + SUPPORT_RECHECK_MS),
          updatedAt: now,
        })
        .where(inArray(parcelRegistrationAttempts.id, [attempt.id]));
      await recordSystemErrorEvent({
        source: "parcel.registration.reconcile-persistence",
        severity: "critical",
        error,
        dedupeKey: `${attempt.id}:persistence:${
          error instanceof RegistrationPersistenceError ? error.code : "database"
        }`,
        context: {
          registrationAttemptId: attempt.id,
          referenceId: attempt.referenceId,
          databaseCode: (error as { code?: unknown } | null)?.code ?? null,
        },
      });
    }
  }

  console.info(
    `[parcel-registration.reconcile] scanned=${byId.size} recovered=${recovered} quarantined=${quarantined} needsSupport=${needsSupport} errors=${errors}`,
  );
  return NextResponse.json({
    ok: errors === 0,
    ranAt: now.toISOString(),
    scanned: byId.size,
    recovered,
    quarantined,
    needsSupport,
    errors,
  });
}

export async function GET(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  try {
    return await runReconcile();
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Reconciliation failed" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
