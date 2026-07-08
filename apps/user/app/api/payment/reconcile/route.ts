import { and, gte, inArray, isNotNull } from "drizzle-orm";
import { readBulkMasterMeta } from "@quickload/shared/bulk-payment";
import { reconcilePendingPaymentFromBeamApi } from "@quickload/shared/beam";
import { getDb, payments } from "@quickload/shared/db";
import { recordSystemErrorEvent } from "@quickload/shared/internal-events";
import { NextResponse } from "next/server";
import {
  sendBulkPaymentSuccessFlex,
  sendPaymentSuccessFlexForPayment,
  sendPaymentTerminalFlexIfSingle,
} from "@/lib/payment-line-notify";

export const dynamic = "force-dynamic";

/**
 * Safety-net reconciliation cron.
 *
 * Why this exists:
 * Beam webhooks are the primary settlement path, but they can be missed when:
 *   - Vercel cold-start causes a 5xx during webhook delivery
 *   - The payment row was already marked `expired` by the rotation step before
 *     the customer's bank app completed the payment (the core production incident)
 *   - Transient network errors prevent webhook delivery
 *
 * This cron polls Beam for every recent non-settled charge and settles anything
 * Beam has already confirmed, acting as a guaranteed-delivery fallback.
 *
 * Grace period: pending rows younger than 5 min are skipped so normal webhook
 * delivery has priority and we don't race against an in-flight webhook.
 * Lookback: 24 hours — Beam retains charge data well beyond that window.
 */

const PENDING_GRACE_MS = 5 * 60 * 1000;
const LOOKBACK_MS = 24 * 60 * 60 * 1000;

function authorizeCron(request: Request): NextResponse | null {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    console.error("[payment.reconcile] CRON_SECRET is not set");
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
  const cutoff = new Date(now.getTime() - LOOKBACK_MS);
  const pendingGraceTime = new Date(now.getTime() - PENDING_GRACE_MS);

  const candidates = await db
    .select({
      id: payments.id,
      status: payments.status,
      providerChargeId: payments.providerChargeId,
      parcelId: payments.parcelId,
      rawCreateResponse: payments.rawCreateResponse,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .where(
      and(
        inArray(payments.status, ["pending", "expired"]),
        isNotNull(payments.providerChargeId),
        gte(payments.createdAt, cutoff),
      ),
    );

  // Pending rows within grace period still expect their webhook; skip them.
  // Expired rows are always eligible — they may have been rotated while in-flight.
  const eligible = candidates.filter(
    (p) => p.status === "expired" || p.createdAt.getTime() < pendingGraceTime.getTime(),
  );

  // Deduplicate by chargeId (bulk children share the master's chargeId; those
  // children have no providerChargeId so isNotNull already filters them out,
  // but guard anyway).
  const seen = new Set<string>();
  const toReconcile = eligible.filter((p) => {
    if (!p.providerChargeId || seen.has(p.providerChargeId)) return false;
    seen.add(p.providerChargeId);
    return true;
  });

  let settled = 0;
  let unchanged = 0;
  let errors = 0;

  for (const payment of toReconcile) {
    try {
      const sync = await reconcilePendingPaymentFromBeamApi(payment.providerChargeId!);

      if (!sync.synced) {
        unchanged++;
        continue;
      }

      try {
        if (sync.outcome === "succeeded") {
          const bulkMeta = readBulkMasterMeta(payment.rawCreateResponse);
          if (bulkMeta) {
            await sendBulkPaymentSuccessFlex(sync.paymentId);
          } else {
            await sendPaymentSuccessFlexForPayment(sync.paymentId, sync.parcelId);
          }
        } else {
          await sendPaymentTerminalFlexIfSingle(sync.paymentId, sync.parcelId, sync.outcome);
        }
      } catch (lineErr) {
        const msg = lineErr instanceof Error ? lineErr.message : String(lineErr);
        console.warn(`[payment.reconcile] line notify failed chargeId=${payment.providerChargeId}:`, msg);
      }

      console.info(
        `[payment.reconcile] settled chargeId=${payment.providerChargeId} outcome=${sync.outcome} paymentId=${sync.paymentId}`,
      );
      settled++;
    } catch (err) {
      errors++;
      console.error(`[payment.reconcile] error chargeId=${payment.providerChargeId}:`, err);
      await recordSystemErrorEvent({
        source: "user.api.payment.reconcile",
        error: err,
        context: { paymentId: payment.id, chargeId: payment.providerChargeId },
      }).catch(() => {});
    }
  }

  console.info(
    `[payment.reconcile] done scanned=${toReconcile.length} settled=${settled} unchanged=${unchanged} errors=${errors}`,
  );

  return NextResponse.json({
    ok: true,
    ranAt: now.toISOString(),
    scanned: toReconcile.length,
    settled,
    unchanged,
    errors,
  });
}

export async function GET(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  try {
    return await runReconcile();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  try {
    return await runReconcile();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
