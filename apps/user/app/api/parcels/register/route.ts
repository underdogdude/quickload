import { and, eq } from "drizzle-orm";
import {
  getDb,
  parcelRegistrationAttempts,
  parcels,
  recipientAddresses,
  senderAddresses,
} from "@quickload/shared/db";
import { recordSystemErrorEvent } from "@quickload/shared/internal-events";
import { resolveParcelDisplayCode } from "@quickload/shared/parcel-display-code";
import { NextResponse } from "next/server";
import {
  decideRegistrationAttempt,
  parcelRegistrationRequestHash,
  validateParcelRegistrationBody,
  type ParcelRegistrationBody,
  type ParcelRegistrationSnapshot,
} from "./_registration-logic";
import { createFlexToken } from "@/lib/flex-token";
import { createOrderSuccessFlexMessage } from "@/lib/line-flex";
import { pushLineMessage } from "@/lib/line-messaging";
import {
  persistProviderSucceededAttemptWithRetry,
  RegistrationPersistenceError,
  type PersistedRegistration,
} from "@/lib/parcel-registration-persistence";
import { resolvePublicBaseUrl } from "@/lib/public-base-url";
import { requireLineSession } from "@/lib/require-user";
import { getSendAccessBlockForUser, sendAccessBlockedResponse } from "@/lib/send-access-block";
import {
  requestSmartpostAddItem,
  SmartpostConfigurationError,
  SmartpostTransportError,
  type SmartpostAddItemPayload,
} from "@/lib/smartpost-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 40;

const STALE_SUBMISSION_MS = 2 * 60 * 1000;

type AttemptUpdate = Partial<typeof parcelRegistrationAttempts.$inferInsert>;

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function updateAttemptWithRetry(
  attemptId: string,
  values: AttemptUpdate,
  retries = 3,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const [updated] = await getDb()
        .update(parcelRegistrationAttempts)
        .set(values)
        .where(eq(parcelRegistrationAttempts.id, attemptId))
        .returning({ id: parcelRegistrationAttempts.id });
      if (!updated) throw new Error("Registration attempt disappeared during update");
      return;
    } catch (error) {
      lastError = error;
      if (attempt < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Registration attempt update failed");
}

function replayResponse(parcel: typeof parcels.$inferSelect) {
  return noStoreJson({
    ok: true,
    replayed: true,
    data: { id: parcel.id, trackingId: parcel.trackingId, barcode: parcel.barcode },
  });
}

async function loadPersistedParcel(parcelId: string, userId: string) {
  const [parcel] = await getDb()
    .select()
    .from(parcels)
    .where(and(eq(parcels.id, parcelId), eq(parcels.userId, userId)))
    .limit(1);
  return parcel;
}

async function markAttemptUnknown(input: {
  attemptId: string;
  error: string;
  source: string;
  context?: Record<string, unknown>;
}) {
  const now = new Date();
  await getDb()
    .update(parcelRegistrationAttempts)
    .set({
      status: "unknown",
      retryable: false,
      lastError: input.error,
      nextReconcileAt: now,
      updatedAt: now,
    })
    .where(eq(parcelRegistrationAttempts.id, input.attemptId));
  await recordSystemErrorEvent({
    source: input.source,
    severity: "critical",
    error: new Error(input.error),
    dedupeKey: `${input.attemptId}:unknown`,
    context: { registrationAttemptId: input.attemptId, ...input.context },
  });
}

async function sendSuccessLineMessage(
  request: Request,
  lineUserId: string,
  userId: string,
  result: PersistedRegistration,
) {
  const { parcel, snapshot, fields } = result;
  const trackingNumber = resolveParcelDisplayCode({
    barcode: parcel.barcode,
    smartpostTrackingcode: fields.smartpostTrackingcode,
    trackingId: parcel.trackingId,
  });
  const referenceCode = fields.smartpostTrackingcode.trim();
  const publicBaseUrl = resolvePublicBaseUrl(request);
  const labelToken = createFlexToken({ userId, parcelId: parcel.id, action: "label" });
  const trackToken = createFlexToken({ userId, parcelId: parcel.id, action: "track" });
  const labelPdfUrl = publicBaseUrl
    ? new URL(`/api/parcels/${encodeURIComponent(parcel.id)}/label.pdf?token=${labelToken}`, publicBaseUrl).toString()
    : null;
  const trackingUrl = publicBaseUrl
    ? new URL(`/api/open/parcel?token=${trackToken}`, publicBaseUrl).toString()
    : null;
  const qrCodeImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(
    trackingNumber,
  )}`;
  const message = createOrderSuccessFlexMessage({
    trackingNumber,
    referenceCode: referenceCode && referenceCode !== trackingNumber ? referenceCode : null,
    senderName: snapshot.sender.contactName,
    senderPhone: snapshot.sender.phone,
    recipientName: snapshot.recipient.contactName,
    recipientPhone: snapshot.recipient.phone,
    weightGram: snapshot.weightGram,
    sizeText: `${snapshot.widthCm} x ${snapshot.lengthCm} x ${snapshot.heightCm} ซม.`,
    parcelType: snapshot.parcelType,
    trackingUrl,
    labelPdfUrl,
    qrCodeImageUrl,
  });
  await pushLineMessage({ to: lineUserId, message });
}

async function persistAndRespond(input: {
  request: Request;
  attemptId: string;
  userId: string;
  lineUserId: string;
}) {
  try {
    const result = await persistProviderSucceededAttemptWithRetry(input.attemptId);
    if (!result.replayed) {
      void sendSuccessLineMessage(
        input.request,
        input.lineUserId,
        input.userId,
        result,
      ).catch(async (error) => {
        await recordSystemErrorEvent({
          source: "parcel.registration.line-success",
          severity: "warning",
          error,
          dedupeKey: `${input.attemptId}:line-success`,
          context: { registrationAttemptId: input.attemptId, parcelId: result.parcel.id },
        });
      });
    }
    return noStoreJson({
      ok: true,
      replayed: result.replayed,
      data: {
        id: result.parcel.id,
        trackingId: result.parcel.trackingId,
        barcode: result.parcel.barcode,
      },
    });
  } catch (error) {
    const missingBarcode =
      error instanceof RegistrationPersistenceError && error.code === "missing_barcode";
    await recordSystemErrorEvent({
      source: missingBarcode
        ? "parcel.registration.accepted-without-barcode"
        : "parcel.registration.provider-success-persistence",
      severity: "critical",
      error,
      dedupeKey: `${input.attemptId}:${missingBarcode ? "missing-barcode" : "persistence"}`,
      context: { registrationAttemptId: input.attemptId },
    });
    return noStoreJson(
      {
        ok: false,
        error: missingBarcode
          ? "SmartPost accepted the parcel but did not return a barcode. Support has been notified."
          : "SmartPost accepted the parcel. Quickload is safely retrying local persistence; do not submit again.",
        retryable: !missingBarcode,
        ambiguous: false,
        registrationAttemptId: input.attemptId,
      },
      missingBarcode ? 502 : 503,
    );
  }
}

export async function POST(request: Request) {
  let activeAttemptId: string | null = null;
  try {
    const session = await requireLineSession();
    const body = (await request.json()) as ParcelRegistrationBody;
    const validation = validateParcelRegistrationBody(body);
    if (!validation.ok) return noStoreJson({ ok: false, error: validation.error }, validation.status);

    const input = validation.value;
    const requestHash = parcelRegistrationRequestHash(input);
    const db = getDb();
    // Replay and local recovery must happen before send-access checks. The
    // parcel created by the first request may itself make the user temporarily
    // blocked; a lost HTTP response must still be able to return that parcel.
    const [earlyAttempt] = await db
      .select()
      .from(parcelRegistrationAttempts)
      .where(
        and(
          eq(parcelRegistrationAttempts.userId, session.userId),
          eq(parcelRegistrationAttempts.referenceId, input.referenceId),
        ),
      )
      .limit(1);
    if (earlyAttempt && earlyAttempt.requestHash !== requestHash) {
      return noStoreJson(
        { ok: false, error: "This registration reference belongs to different parcel details." },
        409,
      );
    }
    if (earlyAttempt?.status === "persisted" && earlyAttempt.parcelId) {
      const parcel = await loadPersistedParcel(earlyAttempt.parcelId, session.userId);
      if (parcel) return replayResponse(parcel);
      throw new Error("Persisted registration attempt points to a missing parcel");
    }
    if (earlyAttempt?.status === "provider_succeeded") {
      activeAttemptId = earlyAttempt.id;
      return persistAndRespond({
        request,
        attemptId: earlyAttempt.id,
        userId: session.userId,
        lineUserId: session.lineUserId,
      });
    }
    if (earlyAttempt?.status === "unknown") {
      return noStoreJson(
        {
          ok: false,
          error: "The carrier result is being investigated. Do not submit this parcel again.",
          retryable: false,
          ambiguous: true,
        },
        409,
      );
    }
    if (earlyAttempt?.status === "submitting") {
      const stale = Date.now() - earlyAttempt.updatedAt.getTime() > STALE_SUBMISSION_MS;
      if (stale) {
        await markAttemptUnknown({
          attemptId: earlyAttempt.id,
          error: "Registration process stopped before SmartPost outcome was durably recorded",
          source: "parcel.registration.stale-submission",
          context: { referenceId: earlyAttempt.referenceId },
        });
      }
      return noStoreJson(
        stale
          ? {
              ok: false,
              error: "The carrier result is being investigated. Do not submit this parcel again.",
              retryable: false,
              ambiguous: true,
            }
          : {
              ok: false,
              error: "This parcel registration is still processing. Please wait and check again.",
              retryable: true,
              processing: true,
            },
        409,
      );
    }
    if (earlyAttempt?.status === "failed" && !earlyAttempt.retryable) {
      return noStoreJson(
        { ok: false, error: earlyAttempt.lastError || "SmartPost rejected this registration.", retryable: false },
        409,
      );
    }

    const sendBlock = await getSendAccessBlockForUser(session.userId);
    if (sendBlock.blocked) return sendAccessBlockedResponse();

    const [sender] = await db
      .select()
      .from(senderAddresses)
      .where(and(eq(senderAddresses.id, input.senderId), eq(senderAddresses.userId, session.userId)))
      .limit(1);
    const [recipient] = await db
      .select()
      .from(recipientAddresses)
      .where(and(eq(recipientAddresses.id, input.recipientId), eq(recipientAddresses.userId, session.userId)))
      .limit(1);
    if (!sender || !recipient) {
      return noStoreJson({ ok: false, error: "Sender or recipient not found" }, 404);
    }

    const snapshot: ParcelRegistrationSnapshot = {
      ...input,
      sender: {
        contactName: sender.contactName,
        phone: sender.phone,
        addressLine: sender.addressLine,
        tambon: sender.tambon,
        amphoe: sender.amphoe,
        province: sender.province,
        zipcode: sender.zipcode,
      },
      recipient: {
        contactName: recipient.contactName,
        phone: recipient.phone,
        addressLine: recipient.addressLine,
        tambon: recipient.tambon,
        amphoe: recipient.amphoe,
        province: recipient.province,
        zipcode: recipient.zipcode,
      },
    };
    const insuranceRatePrice = input.extraInsurance ? input.insuredValue : 0;
    const providerPayload: SmartpostAddItemPayload = {
      shipperName: sender.contactName,
      shipperAddress: sender.addressLine,
      shipperSubdistrict: sender.tambon,
      shipperDistrict: sender.amphoe,
      shipperProvince: sender.province,
      shipperZipcode: sender.zipcode,
      shipperEmail: "",
      shipperMobile: sender.phone,
      cusName: recipient.contactName,
      cusAdd: recipient.addressLine,
      cusSub: recipient.tambon,
      cusAmp: recipient.amphoe,
      cusProv: recipient.province,
      cusZipcode: recipient.zipcode,
      cusTel: recipient.phone,
      cusEmail: "",
      productPrice: "0",
      productInbox: input.parcelType,
      productWeight: String(input.weightGram),
      insuranceRatePrice: String(insuranceRatePrice),
      items: "-",
      referenceId: input.referenceId,
    };

    const now = new Date();
    const [reserved] = await db
      .insert(parcelRegistrationAttempts)
      .values({
        userId: session.userId,
        referenceId: input.referenceId,
        requestHash,
        requestPayload: snapshot,
        providerRequestPayload: providerPayload,
        status: "submitting",
        retryable: false,
        attemptCount: 1,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: [parcelRegistrationAttempts.userId, parcelRegistrationAttempts.referenceId],
      })
      .returning();

    let attempt = reserved;
    let shouldCallProvider = Boolean(reserved);
    if (!attempt) {
      [attempt] = await db
        .select()
        .from(parcelRegistrationAttempts)
        .where(
          and(
            eq(parcelRegistrationAttempts.userId, session.userId),
            eq(parcelRegistrationAttempts.referenceId, input.referenceId),
          ),
        )
        .limit(1);
      if (!attempt) throw new Error("Registration attempt conflict was not readable");

      const decision = decideRegistrationAttempt(attempt, requestHash);
      if (decision === "conflict") {
        return noStoreJson(
          { ok: false, error: "This registration reference belongs to different parcel details." },
          409,
        );
      }
      if (decision === "replay" && attempt.parcelId) {
        const parcel = await loadPersistedParcel(attempt.parcelId, session.userId);
        if (parcel) return replayResponse(parcel);
      }
      if (decision === "resume_persistence") {
        activeAttemptId = attempt.id;
        return persistAndRespond({
          request,
          attemptId: attempt.id,
          userId: session.userId,
          lineUserId: session.lineUserId,
        });
      }
      if (decision === "processing") {
        const stale = Date.now() - attempt.updatedAt.getTime() > STALE_SUBMISSION_MS;
        if (stale) {
          await markAttemptUnknown({
            attemptId: attempt.id,
            error: "Registration process stopped before SmartPost outcome was durably recorded",
            source: "parcel.registration.stale-submission",
            context: { referenceId: attempt.referenceId },
          });
          return noStoreJson(
            {
              ok: false,
              error: "The carrier result is being investigated. Do not submit this parcel again.",
              retryable: false,
              ambiguous: true,
            },
            409,
          );
        }
        return noStoreJson(
          {
            ok: false,
            error: "This parcel registration is still processing. Please wait and check again.",
            retryable: true,
            processing: true,
          },
          409,
        );
      }
      if (decision === "unknown") {
        return noStoreJson(
          {
            ok: false,
            error: "The carrier result is being investigated. Do not submit this parcel again.",
            retryable: false,
            ambiguous: true,
          },
          409,
        );
      }
      if (decision === "failed") {
        return noStoreJson(
          { ok: false, error: attempt.lastError || "SmartPost rejected this registration.", retryable: false },
          409,
        );
      }
      if (decision === "retry_provider") {
        const [claimed] = await db
          .update(parcelRegistrationAttempts)
          .set({
            status: "submitting",
            retryable: false,
            attemptCount: attempt.attemptCount + 1,
            lastError: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(parcelRegistrationAttempts.id, attempt.id),
              eq(parcelRegistrationAttempts.status, "failed"),
              eq(parcelRegistrationAttempts.retryable, true),
            ),
          )
          .returning();
        if (!claimed) {
          return noStoreJson(
            { ok: false, error: "This parcel registration is already being retried.", retryable: true },
            409,
          );
        }
        attempt = claimed;
        shouldCallProvider = true;
      }
    }

    activeAttemptId = attempt.id;
    if (!shouldCallProvider) throw new Error("Invalid registration attempt transition");

    let providerResult;
    try {
      providerResult = await requestSmartpostAddItem(providerPayload);
    } catch (error) {
      if (error instanceof SmartpostTransportError) {
        await markAttemptUnknown({
          attemptId: attempt.id,
          error: error.message,
          source: "parcel.registration.smartpost-ambiguous",
          context: { referenceId: input.referenceId, timedOut: error.timedOut },
        });
        return noStoreJson(
          {
            ok: false,
            error: "The carrier did not return a definite result. Quickload will not submit it twice.",
            retryable: false,
            ambiguous: true,
          },
          error.timedOut ? 504 : 503,
        );
      }
      if (error instanceof SmartpostConfigurationError) {
        await db
          .update(parcelRegistrationAttempts)
          .set({ status: "failed", retryable: false, lastError: error.message, updatedAt: new Date() })
          .where(eq(parcelRegistrationAttempts.id, attempt.id));
        await recordSystemErrorEvent({
          source: "parcel.registration.configuration",
          severity: "critical",
          error,
          dedupeKey: `${attempt.id}:configuration`,
          context: { registrationAttemptId: attempt.id },
        });
        return noStoreJson(
          { ok: false, error: "Parcel registration is not configured. Support has been notified.", retryable: false },
          503,
        );
      }
      throw error;
    }

    if (providerResult.kind === "rejected") {
      if (providerResult.ambiguous) {
        const failedAt = new Date();
        await db
          .update(parcelRegistrationAttempts)
          .set({
            status: "unknown",
            retryable: false,
            providerHttpStatus: providerResult.httpStatus,
            providerResponsePayload: providerResult.rawResponse,
            lastError: providerResult.message || `Ambiguous SmartPost HTTP ${providerResult.httpStatus}`,
            nextReconcileAt: failedAt,
            updatedAt: failedAt,
          })
          .where(eq(parcelRegistrationAttempts.id, attempt.id));
        await recordSystemErrorEvent({
          source: "parcel.registration.smartpost-ambiguous-response",
          severity: "critical",
          error: new Error(providerResult.message || `SmartPost HTTP ${providerResult.httpStatus}`),
          dedupeKey: `${attempt.id}:ambiguous-response`,
          context: {
            registrationAttemptId: attempt.id,
            referenceId: input.referenceId,
            providerHttpStatus: providerResult.httpStatus,
            providerStatus: providerResult.bodyStatuscode,
          },
        });
        return noStoreJson(
          {
            ok: false,
            error: "The carrier returned an uncertain result. Quickload will not submit it twice.",
            retryable: false,
            ambiguous: true,
          },
          503,
        );
      }
      await db
        .update(parcelRegistrationAttempts)
        .set({
          status: "failed",
          retryable: providerResult.classification.retryable,
          providerHttpStatus: providerResult.httpStatus,
          providerResponsePayload: providerResult.rawResponse,
          lastError: providerResult.message || providerResult.classification.userFacingError,
          updatedAt: new Date(),
        })
        .where(eq(parcelRegistrationAttempts.id, attempt.id));
      await recordSystemErrorEvent({
        source: "parcel.registration.smartpost-rejected",
        severity: providerResult.classification.severity,
        error: new Error(providerResult.message || `SmartPost HTTP ${providerResult.httpStatus}`),
        dedupeKey: `${attempt.id}:rejected:${attempt.attemptCount}`,
        context: {
          registrationAttemptId: attempt.id,
          referenceId: input.referenceId,
          providerHttpStatus: providerResult.httpStatus,
          providerStatus: providerResult.bodyStatuscode,
          retryable: providerResult.classification.retryable,
        },
      });
      return noStoreJson(
        {
          ok: false,
          error: providerResult.classification.userFacingError,
          retryable: providerResult.classification.retryable,
        },
        providerResult.classification.clientStatus,
      );
    }

    const acceptedAt = new Date();
    await updateAttemptWithRetry(attempt.id, {
      status: "provider_succeeded",
      retryable: false,
      providerHttpStatus: providerResult.httpStatus,
      providerResponsePayload: providerResult.normalizedResponse,
      smartpostTrackingcode: providerResult.fields.smartpostTrackingcode || null,
      barcode: providerResult.fields.barcode || null,
      providerAcceptedAt: acceptedAt,
      nextReconcileAt: acceptedAt,
      lastError: providerResult.fields.barcode
        ? null
        : "SmartPost accepted the registration without returning a carrier barcode",
      updatedAt: acceptedAt,
    });

    return persistAndRespond({
      request,
      attemptId: attempt.id,
      userId: session.userId,
      lineUserId: session.lineUserId,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    await recordSystemErrorEvent({
      source: "user.api.parcels.register",
      severity: "critical",
      error,
      dedupeKey: activeAttemptId ? `${activeAttemptId}:unhandled` : undefined,
      context: { registrationAttemptId: activeAttemptId },
    });
    return noStoreJson(
      { ok: false, error: "Parcel registration failed. Support has been notified.", retryable: true },
      500,
    );
  }
}
