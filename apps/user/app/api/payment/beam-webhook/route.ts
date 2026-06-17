import {
  extractBeamChargeId,
  markPaymentSucceeded,
  markPaymentTerminalStatus,
  readBeamEnv,
  verifyBeamWebhookSignature,
} from "@quickload/shared/beam";
import { NextResponse } from "next/server";
import { sendPaymentTerminalFlexIfSingle, sendBulkPaymentSuccessFlex, sendPaymentSuccessFlexForPayment } from "@/lib/payment-line-notify";

// Next.js App Router: disable caching and body parsing for raw signature verification.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-beam-signature");
  const event = request.headers.get("x-beam-event");

  const { hmacKeyBase64 } = readBeamEnv();
  const valid = verifyBeamWebhookSignature({
    rawBody,
    signatureHeader: signature,
    hmacKeyBase64,
  });

  console.info(
    `[payment.beam-webhook] event=${event ?? "?"} signatureValid=${valid} bytes=${rawBody.length}`,
  );

  if (!valid) {
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  const terminalEventToStatus: Record<string, "failed" | "expired" | "canceled"> = {
    "charge.failed": "failed",
    "charge.expired": "expired",
    "charge.canceled": "canceled",
  };

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    console.error("[payment.beam-webhook] signed but non-JSON body");
    return NextResponse.json({ ok: true });
  }

  const obj = (parsed ?? {}) as Record<string, unknown>;
  const chargeId = extractBeamChargeId(obj);
  if (!chargeId) {
    console.error("[payment.beam-webhook] missing charge id in payload");
    return NextResponse.json({ ok: true });
  }

  const bodyStatus = typeof obj.status === "string" ? obj.status.toUpperCase() : "";

  if (event === "charge.succeeded") {
    // Some flows still use header charge.succeeded while body.status is terminal.
    if (bodyStatus === "FAILED") {
      const result = await markPaymentTerminalStatus({
        providerChargeId: chargeId,
        nextStatus: "failed",
        rawWebhookPayload: parsed,
      });
      if (result) {
        console.info(
          `[payment.beam-webhook] failed (body) paymentId=${result.paymentId} parcelId=${result.parcelId}`,
        );
        try {
          await sendPaymentTerminalFlexIfSingle(result.paymentId, result.parcelId, "failed", {
            bulk: result.bulk,
          });
        } catch (lineErr) {
          const msg = lineErr instanceof Error ? lineErr.message : String(lineErr);
          console.warn("[line-flex] payment failed send failed:", msg);
        }
      } else {
        console.info(`[payment.beam-webhook] chargeId=${chargeId} already settled or unknown`);
      }
      return NextResponse.json({ ok: true });
    }
    if (bodyStatus === "EXPIRED") {
      const result = await markPaymentTerminalStatus({
        providerChargeId: chargeId,
        nextStatus: "expired",
        rawWebhookPayload: parsed,
      });
      if (result) {
        try {
          await sendPaymentTerminalFlexIfSingle(result.paymentId, result.parcelId, "expired", {
            bulk: result.bulk,
          });
        } catch (lineErr) {
          const msg = lineErr instanceof Error ? lineErr.message : String(lineErr);
          console.warn("[line-flex] payment expired send failed:", msg);
        }
      }
      return NextResponse.json({ ok: true });
    }
    if (bodyStatus === "CANCELED" || bodyStatus === "CANCELLED") {
      const result = await markPaymentTerminalStatus({
        providerChargeId: chargeId,
        nextStatus: "canceled",
        rawWebhookPayload: parsed,
      });
      if (result) {
        try {
          await sendPaymentTerminalFlexIfSingle(result.paymentId, result.parcelId, "canceled", {
            bulk: result.bulk,
          });
        } catch (lineErr) {
          const msg = lineErr instanceof Error ? lineErr.message : String(lineErr);
          console.warn("[line-flex] payment canceled send failed:", msg);
        }
      }
      return NextResponse.json({ ok: true });
    }

    if (
      bodyStatus === "SUCCEEDED" ||
      bodyStatus === "SUCCESS" ||
      bodyStatus === "" /* docs usually set SUCCEEDED; keep lenient */
    ) {
      const result = await markPaymentSucceeded({
        providerChargeId: chargeId,
        rawWebhookPayload: parsed,
      });

      if (result) {
        console.info(
          `[payment.beam-webhook] paid paymentId=${result.paymentId} parcelId=${result.parcelId}`,
        );
        try {
          if (result.bulk) {
            await sendBulkPaymentSuccessFlex(result.paymentId);
          } else {
            await sendPaymentSuccessFlexForPayment(result.paymentId, result.parcelId);
          }
        } catch (lineErr) {
          const msg = lineErr instanceof Error ? lineErr.message : String(lineErr);
          console.warn("[line-flex] payment success send failed:", msg);
        }
      } else {
        console.info(`[payment.beam-webhook] chargeId=${chargeId} already settled or unknown`);
      }
      return NextResponse.json({ ok: true });
    }

    console.info(`[payment.beam-webhook] charge.succeeded unhandled body status=${bodyStatus || "?"}`);
    return NextResponse.json({ ok: true });
  }

  const terminalStatus = event ? terminalEventToStatus[event] : undefined;
  if (terminalStatus) {
    const result = await markPaymentTerminalStatus({
      providerChargeId: chargeId,
      nextStatus: terminalStatus,
      rawWebhookPayload: parsed,
    });
    if (result) {
      console.info(
        `[payment.beam-webhook] ${terminalStatus} paymentId=${result.paymentId} parcelId=${result.parcelId}`,
      );
      try {
        await sendPaymentTerminalFlexIfSingle(result.paymentId, result.parcelId, terminalStatus, {
          bulk: result.bulk,
        });
      } catch (lineErr) {
        const msg = lineErr instanceof Error ? lineErr.message : String(lineErr);
        console.warn("[line-flex] payment failed send failed:", msg);
      }
    } else {
      console.info(`[payment.beam-webhook] chargeId=${chargeId} already settled or unknown`);
    }
    return NextResponse.json({ ok: true });
  }

  // Undocumented charge lifecycle events: same JSON shape as GET /charges/{id}.
  if (event && event !== "payment_link.paid" && bodyStatus === "FAILED") {
    const result = await markPaymentTerminalStatus({
      providerChargeId: chargeId,
      nextStatus: "failed",
      rawWebhookPayload: parsed,
    });
    if (result) {
      try {
        await sendPaymentTerminalFlexIfSingle(result.paymentId, result.parcelId, "failed", {
          bulk: result.bulk,
        });
      } catch (lineErr) {
        const msg = lineErr instanceof Error ? lineErr.message : String(lineErr);
        console.warn("[line-flex] payment failed send failed:", msg);
      }
    }
    return NextResponse.json({ ok: true });
  }
  if (event && event !== "payment_link.paid" && bodyStatus === "EXPIRED") {
    const result = await markPaymentTerminalStatus({
      providerChargeId: chargeId,
      nextStatus: "expired",
      rawWebhookPayload: parsed,
    });
    if (result) {
      try {
        await sendPaymentTerminalFlexIfSingle(result.paymentId, result.parcelId, "expired", {
          bulk: result.bulk,
        });
      } catch (lineErr) {
        const msg = lineErr instanceof Error ? lineErr.message : String(lineErr);
        console.warn("[line-flex] payment expired send failed:", msg);
      }
    }
    return NextResponse.json({ ok: true });
  }
  if (
    event &&
    event !== "payment_link.paid" &&
    (bodyStatus === "CANCELED" || bodyStatus === "CANCELLED")
  ) {
    const result = await markPaymentTerminalStatus({
      providerChargeId: chargeId,
      nextStatus: "canceled",
      rawWebhookPayload: parsed,
    });
    if (result) {
      try {
        await sendPaymentTerminalFlexIfSingle(result.paymentId, result.parcelId, "canceled", {
          bulk: result.bulk,
        });
      } catch (lineErr) {
        const msg = lineErr instanceof Error ? lineErr.message : String(lineErr);
        console.warn("[line-flex] payment canceled send failed:", msg);
      }
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true, ignored: event });
}
