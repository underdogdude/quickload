import { markPaymentSucceeded, readBeamEnv, verifyBeamWebhookSignature } from "@quickload/shared/beam";
import { NextResponse } from "next/server";

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

  if (event !== "charge.succeeded") {
    // Ignore other events cleanly so Beam stops retrying.
    return NextResponse.json({ ok: true, ignored: event });
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    // Already HMAC-verified, so malformed JSON here means a Beam bug. 200 + log.
    console.error("[payment.beam-webhook] signed but non-JSON body");
    return NextResponse.json({ ok: true });
  }

  const obj = (parsed ?? {}) as Record<string, unknown>;
  const chargeId =
    typeof obj.id === "string"
      ? obj.id
      : typeof obj.chargeId === "string"
        ? obj.chargeId
        : typeof (obj.data as Record<string, unknown> | undefined)?.id === "string"
          ? (obj.data as Record<string, unknown>).id as string
          : null;
  if (!chargeId) {
    console.error("[payment.beam-webhook] charge.succeeded missing id");
    return NextResponse.json({ ok: true });
  }

  const result = await markPaymentSucceeded({
    providerChargeId: chargeId,
    rawWebhookPayload: parsed,
  });

  if (result) {
    console.info(
      `[payment.beam-webhook] paid paymentId=${result.paymentId} parcelId=${result.parcelId}`,
    );
  } else {
    console.info(`[payment.beam-webhook] chargeId=${chargeId} already settled or unknown`);
  }

  return NextResponse.json({ ok: true });
}
