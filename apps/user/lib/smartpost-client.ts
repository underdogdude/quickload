import {
  classifySmartpostFailure,
  isSmartpostSuccess,
  normalizeSuccessResponse,
  resolveSmartpostCredentials,
  type SmartpostFailureClassification,
} from "@/app/api/smartpost/add-item/_add-item-logic";
import {
  mapSmartpostInnerToOrderFields,
  parseSmartpostAddItemResponse,
} from "@/lib/smartpost-add-item";

export type SmartpostAddItemPayload = Record<string, string>;

export type SmartpostAcceptedResult = {
  kind: "accepted";
  httpStatus: number;
  normalizedResponse: Record<string, unknown>;
  fields: ReturnType<typeof mapSmartpostInnerToOrderFields>;
  message: string;
};

export type SmartpostRejectedResult = {
  kind: "rejected";
  httpStatus: number;
  rawResponse: unknown;
  bodyStatuscode: string;
  message: string;
  ambiguous: boolean;
  classification: SmartpostFailureClassification;
};

export class SmartpostTransportError extends Error {
  readonly ambiguous = true;
  readonly timedOut: boolean;

  constructor(message: string, timedOut: boolean, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SmartpostTransportError";
    this.timedOut = timedOut;
  }
}

export class SmartpostConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmartpostConfigurationError";
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function responseRecord(raw: unknown): Record<string, unknown> {
  let record: Record<string, unknown>;
  if (Array.isArray(raw)) {
    const first = raw[0];
    record = first && typeof first === "object" ? (first as Record<string, unknown>) : {};
  } else {
    record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  }
  if (
    record.statuscode == null &&
    record.message == null &&
    record.data &&
    typeof record.data === "object" &&
    !Array.isArray(record.data)
  ) {
    const nested = record.data as Record<string, unknown>;
    if (nested.statuscode != null || nested.message != null) return nested;
  }
  return record;
}

function isAmbiguousProviderFailure(httpStatus: number, bodyStatuscode: string): boolean {
  const statusCodes = new Set(["408", "500", "502", "503", "504"]);
  return statusCodes.has(String(httpStatus)) || statusCodes.has(bodyStatuscode.trim());
}

/** JSONB-safe representation that preserves non-JSON provider responses. */
export function jsonSafeProviderResponse(raw: unknown): unknown {
  if (
    raw === null ||
    typeof raw === "boolean" ||
    typeof raw === "number" ||
    typeof raw === "string" ||
    Array.isArray(raw) ||
    typeof raw === "object"
  ) {
    return raw;
  }
  return String(raw);
}

export async function requestSmartpostAddItem(
  payload: SmartpostAddItemPayload,
  options: {
    fetcher?: typeof fetch;
    timeoutMs?: number;
  } = {},
): Promise<SmartpostAcceptedResult | SmartpostRejectedResult> {
  const credentials = resolveSmartpostCredentials({
    username: process.env.SMARTPOST_BASIC_AUTH_USERNAME,
    password: process.env.SMARTPOST_BASIC_AUTH_PASSWORD,
  });
  if (!credentials) {
    throw new SmartpostConfigurationError("SmartPost Basic Auth credentials are not configured");
  }

  const apiBaseUrl =
    process.env.SMARTPOST_API_BASE_URL?.trim() || "https://api.getsmartpost.com/webservice/";
  const addItemPath = process.env.SMARTPOST_ADD_ITEM_PATH?.trim() || "addItem";
  const endpoint = new URL(
    addItemPath,
    apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`,
  ).toString();
  const auth = Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64");
  const timeoutMs = options.timeoutMs ?? 25_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    const timedOut = isAbortError(error);
    throw new SmartpostTransportError(
      timedOut ? "SmartPost addItem timed out" : "SmartPost addItem request failed",
      timedOut,
      { cause: error },
    );
  } finally {
    clearTimeout(timer);
  }

  const rawText = await response.text();
  let rawResponse: unknown = rawText;
  try {
    rawResponse = JSON.parse(rawText) as unknown;
  } catch {
    // Keep the provider body as text for diagnostics and reconciliation.
  }

  const record = responseRecord(rawResponse);
  const bodyStatuscode = String(record.statuscode ?? "");
  const message = typeof record.message === "string" ? record.message : "";

  if (!isSmartpostSuccess(response.status, bodyStatuscode)) {
    return {
      kind: "rejected",
      httpStatus: response.status,
      rawResponse: jsonSafeProviderResponse(rawResponse),
      bodyStatuscode,
      message,
      ambiguous: isAmbiguousProviderFailure(response.status, bodyStatuscode),
      classification: classifySmartpostFailure({
        httpStatus: response.status,
        bodyStatuscode,
        message,
      }),
    };
  }

  const normalizedResponse = normalizeSuccessResponse(rawResponse);
  const parsed = parseSmartpostAddItemResponse(normalizedResponse);
  const fields = mapSmartpostInnerToOrderFields(parsed?.inner ?? {});
  return {
    kind: "accepted",
    httpStatus: response.status,
    normalizedResponse,
    fields,
    message: parsed?.message || message || "Create successful",
  };
}
