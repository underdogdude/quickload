import { and, eq } from "drizzle-orm";
import {
  getDb,
  internalEvents,
  orders,
  parcelRegistrationAttempts,
  parcels,
} from "@quickload/shared/db";
import { normalizeCarrierBarcode } from "@quickload/shared/parcel-display-code";
import {
  readParcelRegistrationSnapshot,
  type ParcelRegistrationSnapshot,
} from "@/app/api/parcels/register/_registration-logic";
import {
  mapSmartpostInnerToOrderFields,
  parseSmartpostAddItemResponse,
} from "@/lib/smartpost-add-item";

export class RegistrationPersistenceError extends Error {
  readonly code: "attempt_missing" | "invalid_state" | "invalid_snapshot" | "missing_barcode" | "conflict";

  constructor(
    code: RegistrationPersistenceError["code"],
    message: string,
  ) {
    super(message);
    this.name = "RegistrationPersistenceError";
    this.code = code;
  }
}

export type PersistedRegistration = {
  parcel: typeof parcels.$inferSelect;
  snapshot: ParcelRegistrationSnapshot;
  fields: ReturnType<typeof mapSmartpostInnerToOrderFields>;
  replayed: boolean;
};

function nullableNumericText(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? text : null;
}

function parseDurableProviderResponse(raw: unknown) {
  const parsed = parseSmartpostAddItemResponse(raw);
  if (!parsed) {
    throw new RegistrationPersistenceError(
      "invalid_snapshot",
      "Stored SmartPost response cannot be parsed",
    );
  }
  const fields = mapSmartpostInnerToOrderFields(parsed.inner);
  const barcode = normalizeCarrierBarcode(fields.barcode);
  if (!barcode) {
    throw new RegistrationPersistenceError(
      "missing_barcode",
      "SmartPost accepted the registration without returning a carrier barcode",
    );
  }
  return {
    parsed,
    fields: { ...fields, barcode },
    barcode,
    trackingId: fields.smartpostTrackingcode.trim() || barcode,
  };
}

/**
 * Complete only the local side of a previously accepted SmartPost request.
 * This function is intentionally idempotent and safe for both the request path
 * and the reconciliation cron. It never calls SmartPost.
 */
export async function persistProviderSucceededAttempt(
  attemptId: string,
): Promise<PersistedRegistration> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [attempt] = await tx
      .select()
      .from(parcelRegistrationAttempts)
      .where(eq(parcelRegistrationAttempts.id, attemptId))
      .limit(1)
      .for("update");
    if (!attempt) {
      throw new RegistrationPersistenceError("attempt_missing", "Registration attempt not found");
    }

    const snapshot = readParcelRegistrationSnapshot(attempt.requestPayload);
    if (!snapshot) {
      throw new RegistrationPersistenceError(
        "invalid_snapshot",
        "Registration attempt contains an invalid request snapshot",
      );
    }
    const provider = parseDurableProviderResponse(attempt.providerResponsePayload);

    if (attempt.status === "persisted" && attempt.parcelId) {
      const [parcel] = await tx
        .select()
        .from(parcels)
        .where(eq(parcels.id, attempt.parcelId))
        .limit(1);
      if (parcel) return { parcel, snapshot, fields: provider.fields, replayed: true };
    }
    if (attempt.status !== "provider_succeeded") {
      throw new RegistrationPersistenceError(
        "invalid_state",
        `Registration attempt is ${attempt.status}, not provider_succeeded`,
      );
    }

    // A previous local transaction may have committed immediately before its
    // response was lost. Link it back to the durable attempt instead of inserting.
    const [existingOrder] = await tx
      .select({
        parcelId: orders.parcelId,
        userId: orders.userId,
        barcode: orders.barcode,
      })
      .from(orders)
      .where(
        and(
          eq(orders.userId, attempt.userId),
          eq(orders.referenceId, attempt.referenceId),
        ),
      )
      .limit(1);
    if (existingOrder) {
      if (normalizeCarrierBarcode(existingOrder.barcode) !== provider.barcode) {
        throw new RegistrationPersistenceError(
          "conflict",
          "Existing referenceId belongs to a different carrier barcode",
        );
      }
      const [parcel] = await tx
        .select()
        .from(parcels)
        .where(eq(parcels.id, existingOrder.parcelId))
        .limit(1);
      if (!parcel || parcel.userId !== attempt.userId) {
        throw new RegistrationPersistenceError(
          "conflict",
          "Existing referenceId belongs to an invalid parcel owner",
        );
      }
      await tx
        .update(parcelRegistrationAttempts)
        .set({
          status: "persisted",
          parcelId: parcel.id,
          barcode: provider.barcode,
          persistedAt: new Date(),
          retryable: false,
          lastError: null,
          nextReconcileAt: null,
          updatedAt: new Date(),
        })
        .where(eq(parcelRegistrationAttempts.id, attempt.id));
      return { parcel, snapshot, fields: provider.fields, replayed: true };
    }

    const [barcodeOwner] = await tx
      .select({ id: parcels.id, userId: parcels.userId })
      .from(parcels)
      .where(eq(parcels.barcode, provider.barcode))
      .limit(1);
    if (barcodeOwner) {
      throw new RegistrationPersistenceError(
        "conflict",
        `Carrier barcode is already linked to parcel ${barcodeOwner.id}`,
      );
    }

    const destination = `${snapshot.recipient.contactName} · ${snapshot.recipient.amphoe}, ${snapshot.recipient.province}`;
    const [parcel] = await tx
      .insert(parcels)
      .values({
        trackingId: provider.trackingId,
        barcode: provider.barcode,
        userId: attempt.userId,
        destination,
        weightKg: (snapshot.weightGram / 1000).toFixed(3),
        size: `${snapshot.widthCm}x${snapshot.lengthCm}x${snapshot.heightCm}cm`,
        parcelType: snapshot.parcelType,
        note: snapshot.note,
        status: "awaiting_actual_weight",
        price: null,
        source: `send:${snapshot.shippingMode}:${snapshot.autoPrint ? "autoprint" : "manual"}`,
      })
      .returning();
    if (!parcel) throw new Error("Failed to create parcel from accepted registration");

    const f = provider.fields;
    await tx.insert(orders).values({
      parcelId: parcel.id,
      userId: attempt.userId,
      statuscode: provider.parsed.statuscode || "201",
      message: provider.parsed.message || "Create successful",
      smartpostTrackingcode: f.smartpostTrackingcode || null,
      barcode: provider.barcode,
      serviceType: f.serviceType || null,
      productInbox: f.productInbox || null,
      productWeight: f.productWeight || String(snapshot.weightGram),
      productPrice: f.productPrice || null,
      boxsize: f.boxsize || null,
      shipperName: f.shipperName || snapshot.sender.contactName,
      shipperAddress: f.shipperAddress || snapshot.sender.addressLine,
      shipperSubdistrict: f.shipperSubdistrict || snapshot.sender.tambon,
      shipperDistrict: f.shipperDistrict || snapshot.sender.amphoe,
      shipperProvince: f.shipperProvince || snapshot.sender.province,
      shipperZipcode: f.shipperZipcode || snapshot.sender.zipcode,
      shipperEmail: f.shipperEmail || null,
      shipperMobile: f.shipperMobile || snapshot.sender.phone,
      cusName: f.cusName || snapshot.recipient.contactName,
      cusAdd: f.cusAdd || snapshot.recipient.addressLine,
      cusSub: f.cusSub || snapshot.recipient.tambon,
      cusAmp: f.cusAmp || snapshot.recipient.amphoe,
      cusProv: f.cusProv || snapshot.recipient.province,
      cusZipcode: f.cusZipcode || snapshot.recipient.zipcode,
      cusTel: f.cusTel || snapshot.recipient.phone,
      cusEmail: f.cusEmail || null,
      customerCode: f.customerCode || null,
      cost: nullableNumericText(f.cost),
      finalcost: nullableNumericText(f.finalcost),
      orderStatus: f.orderStatus || null,
      items: f.items || null,
      insuranceRatePrice: f.insuranceRatePrice || null,
      referenceId: attempt.referenceId,
    });

    const now = new Date();
    await tx
      .update(parcelRegistrationAttempts)
      .set({
        status: "persisted",
        parcelId: parcel.id,
        barcode: provider.barcode,
        persistedAt: now,
        retryable: false,
        lastError: null,
        nextReconcileAt: null,
        updatedAt: now,
      })
      .where(eq(parcelRegistrationAttempts.id, attempt.id));

    // Transactional outbox: the admin alert cannot exist without the parcel,
    // and the parcel cannot commit without its event record.
    await tx
      .insert(internalEvents)
      .values({
        type: "parcel.created",
        eventKey: `parcel.created:${parcel.id}`,
        payload: {
          parcelId: parcel.id,
          userId: attempt.userId,
          trackingId: parcel.trackingId,
          barcode: provider.barcode,
          smartpostTrackingcode: f.smartpostTrackingcode || null,
          recipientProvince: snapshot.recipient.province,
          recipientName: snapshot.recipient.contactName,
          senderName: snapshot.sender.contactName,
          weightGram: snapshot.weightGram,
          parcelType: snapshot.parcelType,
          shippingMode: snapshot.shippingMode,
          autoPrint: snapshot.autoPrint,
          registrationAttemptId: attempt.id,
        },
        status: "pending",
        nextAttemptAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: internalEvents.eventKey });

    return { parcel, snapshot, fields: provider.fields, replayed: false };
  });
}

/** Retry only the idempotent local transaction; never repeat the carrier call. */
export async function persistProviderSucceededAttemptWithRetry(
  attemptId: string,
  retries = 3,
): Promise<PersistedRegistration> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await persistProviderSucceededAttempt(attemptId);
    } catch (error) {
      lastError = error;
      if (error instanceof RegistrationPersistenceError) throw error;
      if (attempt < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Registration persistence failed");
}
