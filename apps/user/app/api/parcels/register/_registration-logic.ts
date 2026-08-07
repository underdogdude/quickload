import { createHash } from "node:crypto";
import { sanitizeParcelNote } from "@quickload/shared/parcel-note";
import { normalizeSmartpostReferenceId } from "@/app/api/smartpost/add-item/_add-item-logic";
import {
  MAX_PARCEL_WEIGHT_GRAM,
  MIN_PARCEL_WEIGHT_GRAM,
  parsePositiveCm,
  validateParcelDimensionsCm,
} from "@/lib/parcel-dimensions";

export type ParcelRegistrationBody = {
  senderId?: unknown;
  recipientId?: unknown;
  shippingMode?: unknown;
  autoPrint?: unknown;
  weightGram?: unknown;
  widthCm?: unknown;
  lengthCm?: unknown;
  heightCm?: unknown;
  parcelType?: unknown;
  note?: unknown;
  insuredValue?: unknown;
  extraInsurance?: unknown;
  referenceId?: unknown;
};

export type ValidatedParcelRegistration = {
  senderId: string;
  recipientId: string;
  shippingMode: "branch" | "pickup";
  autoPrint: boolean;
  weightGram: number;
  widthCm: number;
  lengthCm: number;
  heightCm: number;
  parcelType: string;
  note: string | null;
  insuredValue: number;
  extraInsurance: boolean;
  referenceId: string;
};

export type ParcelRegistrationSnapshot = ValidatedParcelRegistration & {
  sender: {
    contactName: string;
    phone: string;
    addressLine: string;
    tambon: string;
    amphoe: string;
    province: string;
    zipcode: string;
  };
  recipient: {
    contactName: string;
    phone: string;
    addressLine: string;
    tambon: string;
    amphoe: string;
    province: string;
    zipcode: string;
  };
};

export type RegistrationValidationResult =
  | { ok: true; value: ValidatedParcelRegistration }
  | { ok: false; status: 400; error: string };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function validateParcelRegistrationBody(
  body: ParcelRegistrationBody,
): RegistrationValidationResult {
  const senderId = text(body.senderId);
  const recipientId = text(body.recipientId);
  const parcelType = text(body.parcelType);
  const referenceId = normalizeSmartpostReferenceId(text(body.referenceId));
  const shippingMode = body.shippingMode;
  const weightGram = numberValue(body.weightGram);
  const widthCm = parsePositiveCm(
    typeof body.widthCm === "string" || typeof body.widthCm === "number"
      ? body.widthCm
      : undefined,
  );
  const lengthCm = parsePositiveCm(
    typeof body.lengthCm === "string" || typeof body.lengthCm === "number"
      ? body.lengthCm
      : undefined,
  );
  const heightCm = parsePositiveCm(
    typeof body.heightCm === "string" || typeof body.heightCm === "number"
      ? body.heightCm
      : undefined,
  );

  if (!senderId || !recipientId) {
    return { ok: false, status: 400, error: "senderId and recipientId are required" };
  }
  if (!referenceId) {
    return { ok: false, status: 400, error: "A valid referenceId is required" };
  }
  if (shippingMode !== "branch" && shippingMode !== "pickup") {
    return { ok: false, status: 400, error: "shippingMode must be branch or pickup" };
  }
  if (!parcelType) {
    return { ok: false, status: 400, error: "parcelType is required" };
  }
  if (!weightGram || weightGram < MIN_PARCEL_WEIGHT_GRAM || weightGram > MAX_PARCEL_WEIGHT_GRAM) {
    return {
      ok: false,
      status: 400,
      error:
        weightGram && weightGram > MAX_PARCEL_WEIGHT_GRAM
          ? "น้ำหนักพัสดุต้องไม่เกิน 30 กิโลกรัม หรือ 30,000 กรัม"
          : `น้ำหนักพัสดุต้องไม่ต่ำกว่า ${MIN_PARCEL_WEIGHT_GRAM} กรัม`,
    };
  }
  if (widthCm === null || lengthCm === null || heightCm === null) {
    return { ok: false, status: 400, error: "weight and dimensions are required" };
  }
  const dimensionError = validateParcelDimensionsCm({ widthCm, lengthCm, heightCm });
  if (dimensionError) return { ok: false, status: 400, error: dimensionError };

  const insuredValue = Math.max(0, numberValue(body.insuredValue) ?? 0);
  return {
    ok: true,
    value: {
      senderId,
      recipientId,
      shippingMode,
      autoPrint: body.autoPrint === true,
      weightGram,
      widthCm,
      lengthCm,
      heightCm,
      parcelType,
      note: sanitizeParcelNote(body.note),
      insuredValue,
      extraInsurance: body.extraInsurance === true,
      referenceId,
    },
  };
}

export function parcelRegistrationRequestHash(
  input: ValidatedParcelRegistration,
): string {
  // Hash the user-selected registration intent, not the mutable address-book
  // contents. This lets a lost response replay the original frozen snapshot even
  // if an address is later edited, while preventing the reference from being
  // reused for a different address id or different parcel details.
  const intent: ValidatedParcelRegistration = {
    senderId: input.senderId,
    recipientId: input.recipientId,
    shippingMode: input.shippingMode,
    autoPrint: input.autoPrint,
    weightGram: input.weightGram,
    widthCm: input.widthCm,
    lengthCm: input.lengthCm,
    heightCm: input.heightCm,
    parcelType: input.parcelType,
    note: input.note,
    insuredValue: input.insuredValue,
    extraInsurance: input.extraInsurance,
    referenceId: input.referenceId,
  };
  return createHash("sha256").update(JSON.stringify(intent)).digest("hex");
}

export type ExistingAttemptSummary = {
  requestHash: string;
  status: string;
  retryable: boolean;
  parcelId: string | null;
};

export type AttemptDecision =
  | "conflict"
  | "replay"
  | "resume_persistence"
  | "processing"
  | "unknown"
  | "retry_provider"
  | "failed";

export function decideRegistrationAttempt(
  attempt: ExistingAttemptSummary,
  requestHash: string,
): AttemptDecision {
  if (attempt.requestHash !== requestHash) return "conflict";
  if (attempt.status === "persisted" && attempt.parcelId) return "replay";
  if (attempt.status === "provider_succeeded") return "resume_persistence";
  if (attempt.status === "submitting") return "processing";
  if (attempt.status === "unknown") return "unknown";
  if (attempt.status === "failed") return attempt.retryable ? "retry_provider" : "failed";
  return "failed";
}

export function readParcelRegistrationSnapshot(raw: unknown): ParcelRegistrationSnapshot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const validation = validateParcelRegistrationBody(record);
  if (!validation.ok) return null;
  const sender = record.sender;
  const recipient = record.recipient;
  if (!sender || typeof sender !== "object" || !recipient || typeof recipient !== "object") return null;

  const readAddress = (value: object) => {
    const address = value as Record<string, unknown>;
    const snapshot = {
      contactName: text(address.contactName),
      phone: text(address.phone),
      addressLine: text(address.addressLine),
      tambon: text(address.tambon),
      amphoe: text(address.amphoe),
      province: text(address.province),
      zipcode: text(address.zipcode),
    };
    return Object.values(snapshot).every(Boolean) ? snapshot : null;
  };

  const senderSnapshot = readAddress(sender);
  const recipientSnapshot = readAddress(recipient);
  if (!senderSnapshot || !recipientSnapshot) return null;
  return { ...validation.value, sender: senderSnapshot, recipient: recipientSnapshot };
}
