import { readApiJson } from "./api-json";

const SMARTPOST_REFERENCE_STORAGE_PREFIX = "quickload:smartpost-reference:";
const SMARTPOST_RESULT_STORAGE_SUFFIX = ":result";
const SMARTPOST_COMPLETED_STORAGE_SUFFIX = ":completed";

export type ParcelOrderInput = {
  senderId: string;
  recipientId: string;
  shippingMode: "branch" | "pickup";
  autoPrint: boolean;
  weightGram: string;
  widthCm: string;
  lengthCm: string;
  heightCm: string;
  parcelType: string;
  note: string;
  insuredValue: string;
  extraInsurance: boolean;
};

export type ParcelOrderProgress = "registering" | "saving";

export type CreatedParcel = {
  id: string;
  trackingId: string | null;
};

export class ParcelOrderClientError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable = true) {
    super(message);
    this.name = "ParcelOrderClientError";
    this.retryable = retryable;
  }
}

function buildReferenceStorageKey(
  input: ParcelOrderInput,
  attemptId?: string,
): string {
  if (attemptId) {
    return `${SMARTPOST_REFERENCE_STORAGE_PREFIX}attempt:${attemptId}`;
  }
  return `${SMARTPOST_REFERENCE_STORAGE_PREFIX}${[
    input.senderId,
    input.recipientId,
    input.parcelType.trim(),
    input.weightGram,
    input.widthCm,
    input.lengthCm,
    input.heightCm,
    input.note.trim(),
    input.insuredValue || "0",
    input.extraInsurance ? "1" : "0",
    input.shippingMode,
    input.autoPrint ? "1" : "0",
  ].join("|")}`;
}

function createReferenceId(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `QL-${random}`;
}

export function createParcelOrderAttemptId(): string {
  return createReferenceId();
}

function getReferenceId(storageKey: string, attemptId?: string): string {
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const next = attemptId || createReferenceId();
    sessionStorage.setItem(storageKey, next);
    return next;
  } catch {
    return attemptId || createReferenceId();
  }
}

function clearPendingRegistration(storageKey: string): void {
  try {
    sessionStorage.removeItem(storageKey);
    sessionStorage.removeItem(`${storageKey}${SMARTPOST_RESULT_STORAGE_SUFFIX}`);
  } catch {
    // sessionStorage can be unavailable in hardened WebViews.
  }
}

function readCompletedParcel(storageKey: string): CreatedParcel | null {
  try {
    const raw = sessionStorage.getItem(
      `${storageKey}${SMARTPOST_COMPLETED_STORAGE_SUFFIX}`,
    );
    if (!raw) return null;
    const cached = JSON.parse(raw) as {
      id?: unknown;
      trackingId?: unknown;
    };
    if (typeof cached.id !== "string" || !cached.id.trim()) return null;
    return {
      id: cached.id,
      trackingId:
        typeof cached.trackingId === "string" && cached.trackingId.trim()
          ? cached.trackingId
          : null,
    };
  } catch {
    return null;
  }
}

function cacheCompletedParcel(
  storageKey: string,
  created: CreatedParcel,
): void {
  try {
    sessionStorage.setItem(
      `${storageKey}${SMARTPOST_COMPLETED_STORAGE_SUFFIX}`,
      JSON.stringify(created),
    );
  } catch {
    // Server-side reference replay remains the fallback when storage is unavailable.
  }
}

function readRegisteredSmartpostData(
  storageKey: string,
  referenceId: string,
): unknown | undefined {
  try {
    const resultKey = `${storageKey}${SMARTPOST_RESULT_STORAGE_SUFFIX}`;
    const raw = sessionStorage.getItem(resultKey);
    if (!raw) return undefined;
    const cached = JSON.parse(raw) as {
      referenceId?: unknown;
      data?: unknown;
    };
    if (cached.referenceId !== referenceId || cached.data === undefined) {
      sessionStorage.removeItem(resultKey);
      return undefined;
    }
    return cached.data;
  } catch {
    return undefined;
  }
}

function cacheRegisteredSmartpostData(
  storageKey: string,
  referenceId: string,
  data: unknown,
): void {
  try {
    sessionStorage.setItem(
      `${storageKey}${SMARTPOST_RESULT_STORAGE_SUFFIX}`,
      JSON.stringify({ referenceId, data }),
    );
  } catch {
    // A storage failure must not turn a successful provider response into an error.
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export async function createParcelOrder(
  input: ParcelOrderInput,
  options: {
    fetcher?: typeof fetch;
    onProgress?: (step: ParcelOrderProgress) => void;
    attemptId?: string;
  } = {},
): Promise<CreatedParcel> {
  const fetcher = options.fetcher ?? fetch;
  const attemptId = options.attemptId?.trim() || undefined;
  const storageKey = buildReferenceStorageKey(input, attemptId);
  const completed = attemptId ? readCompletedParcel(storageKey) : null;
  if (completed) return completed;
  const referenceId = getReferenceId(storageKey, attemptId);

  let smartpostData = readRegisteredSmartpostData(storageKey, referenceId);
  if (smartpostData === undefined) {
    options.onProgress?.("registering");
    const registerController = new AbortController();
    const registerTimer = setTimeout(() => registerController.abort(), 30_000);
    try {
      const response = await fetcher("/api/smartpost/add-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId: input.senderId,
          recipientId: input.recipientId,
          parcelType: input.parcelType,
          weightGram: input.weightGram,
          insuredValue: input.insuredValue,
          extraInsurance: input.extraInsurance,
          referenceId,
        }),
        signal: registerController.signal,
      });
      const json = await readApiJson<{
        ok?: boolean;
        error?: string;
        message?: string;
        data?: unknown;
        retryable?: boolean;
      }>(response, "ระบบลงทะเบียนพัสดุยังไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง");
      if (!response.ok || !json.ok || json.data === undefined) {
        throw new ParcelOrderClientError(
          json.message ||
            json.error ||
            "ลงทะเบียนพัสดุไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
          json.retryable !== false,
        );
      }
      smartpostData = json.data;
      cacheRegisteredSmartpostData(storageKey, referenceId, smartpostData);
    } catch (error) {
      if (error instanceof ParcelOrderClientError) throw error;
      if (isAbortError(error)) {
        throw new ParcelOrderClientError(
          "ระบบลงทะเบียนพัสดุไม่ตอบสนอง กรุณาลองใหม่อีกครั้ง",
        );
      }
      if (error instanceof Error && error.name === "Error") {
        throw new ParcelOrderClientError(error.message);
      }
      throw new ParcelOrderClientError(
        "เชื่อมต่อระบบลงทะเบียนพัสดุไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่",
      );
    } finally {
      clearTimeout(registerTimer);
    }
  }

  options.onProgress?.("saving");
  const saveController = new AbortController();
  const saveTimer = setTimeout(() => saveController.abort(), 20_000);
  try {
    const response = await fetcher("/api/parcels/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
        referenceId,
        smartpostAddItemResponse: smartpostData,
      }),
      signal: saveController.signal,
    });
    const json = await readApiJson<{
      ok?: boolean;
      error?: string;
      message?: string;
      data?: { id?: string; trackingId?: string };
    }>(response, "ระบบบันทึกพัสดุยังไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง");
    if (!response.ok || !json.ok || !json.data?.id) {
      throw new ParcelOrderClientError(
        json.message ||
          json.error ||
          "บันทึกพัสดุไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
      );
    }
    const created = {
      id: json.data.id,
      trackingId: json.data.trackingId?.trim() || null,
    };
    if (attemptId) cacheCompletedParcel(storageKey, created);
    clearPendingRegistration(storageKey);
    return created;
  } catch (error) {
    if (error instanceof ParcelOrderClientError) throw error;
    if (isAbortError(error)) {
      throw new ParcelOrderClientError(
        "ระบบบันทึกพัสดุไม่ตอบสนอง กรุณาลองใหม่อีกครั้ง",
      );
    }
    if (error instanceof Error && error.name === "Error") {
      throw new ParcelOrderClientError(error.message);
    }
    throw new ParcelOrderClientError(
      "บันทึกพัสดุไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่",
    );
  } finally {
    clearTimeout(saveTimer);
  }
}
