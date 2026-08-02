export const ISHIP_REMARK_MAX_LENGTH = 500;
export const ISHIP_UPSTREAM_TIMEOUT_MS = 25_000;
/**
 * Business decision: courier pickup requests always use Thailand Post eParcel X.
 * The request_courier API accepts parcel quantity but no weight, so Quickload
 * does not attempt to select eParcel Z from locally stored weight data.
 * See docs/iship-pickup.md.
 */
export const ISHIP_PICKUP_COURIER_CODE = "THP_eParcelX" as const;

export type IshipPickupStatus =
  | "submitting"
  | "requested"
  | "assigned"
  | "picked_up"
  | "cancelled"
  | "failed"
  | "unknown";

export type IshipRequestCourierPayload = {
  courier_code: typeof ISHIP_PICKUP_COURIER_CODE;
  pickup_address: string;
  name: string;
  phone: string;
  parcel: number;
  remark: string;
};

export type IshipRequestCourierResult = {
  message: string;
  ticketPickupId: string;
  recordId: string | null;
  staffInfoName: string | null;
  staffInfoPhone: string | null;
  timeoutAtText: string | null;
  ticketMessage: string | null;
  raw: unknown;
};

export class IshipApiError extends Error {
  readonly code: "config" | "timeout" | "network" | "provider" | "invalid_response" | "order_required";
  readonly ambiguous: boolean;
  readonly httpStatus: number;
  readonly rawResponse: unknown;

  constructor(input: {
    message: string;
    code: IshipApiError["code"];
    ambiguous?: boolean;
    httpStatus?: number;
    rawResponse?: unknown;
  }) {
    super(input.message);
    this.name = "IshipApiError";
    this.code = input.code;
    this.ambiguous = Boolean(input.ambiguous);
    this.httpStatus = input.httpStatus ?? 502;
    this.rawResponse = input.rawResponse ?? null;
  }
}

type IshipConfig = {
  baseUrl: string;
  bearerToken: string;
};

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nullableText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function parseJsonText(text: string): unknown {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function responseMessage(raw: unknown, fallback: string): string {
  const root = recordOf(raw);
  const message = nullableText(root?.msg) ?? nullableText(root?.message) ?? fallback;
  return message.replace(/i\s*ship/gi, "ผู้ให้บริการ");
}

function isOrderRequiredMessage(message: string): boolean {
  return /at\s+least\s*1\s*(parcel|order)|create.{0,30}(parcel|order)|อย่างน้อย\s*1|สร้าง.{0,30}พัสดุ/i.test(
    message,
  );
}

export function getIshipConfig(): IshipConfig {
  const baseUrl = process.env.ISHIP_BASE_URL?.trim() || "https://app.iship.cloud";
  const bearerToken = process.env.ISHIP_BEARER_TOKEN?.trim() || "";

  if (!bearerToken) {
    throw new IshipApiError({
      code: "config",
      httpStatus: 503,
      message: "ยังไม่ได้ตั้งค่าบริการเรียกรถเข้ารับ กรุณาติดต่อฝ่ายดูแลระบบ",
    });
  }
  return { baseUrl, bearerToken };
}

export function normalizeIshipPhone(value: string): string {
  return value.replace(/\D/g, "");
}

export function sanitizeIshipRemark(value: string, maxLength = ISHIP_REMARK_MAX_LENGTH): string {
  return value
    .replace(/[:.]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
    .trim();
}

export function formatIshipPickupAddress(input: {
  addressLine: string;
  tambon: string;
  amphoe: string;
  province: string;
  zipcode: string;
}): string {
  const tambonPrefix = input.province.trim() === "กรุงเทพมหานคร" ? "แขวง" : "ต.";
  const amphoePrefix = input.province.trim() === "กรุงเทพมหานคร" ? "เขต" : "อ.";
  return [
    input.addressLine.trim(),
    `${tambonPrefix}${input.tambon.trim()}`,
    `${amphoePrefix}${input.amphoe.trim()}`,
    input.province.trim(),
    input.zipcode.trim(),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildIshipRequestCourierPayload(input: {
  pickupAddress: string;
  name: string;
  phone: string;
  parcelCount: number;
  remark: string;
}): IshipRequestCourierPayload {
  return {
    courier_code: ISHIP_PICKUP_COURIER_CODE,
    pickup_address: input.pickupAddress.trim(),
    name: input.name.trim(),
    phone: normalizeIshipPhone(input.phone),
    parcel: Math.trunc(input.parcelCount),
    remark: sanitizeIshipRemark(input.remark),
  };
}

export async function requestIshipCourier(
  payload: IshipRequestCourierPayload,
  fetcher: typeof fetch = fetch,
): Promise<IshipRequestCourierResult> {
  const config = getIshipConfig();
  const endpoint = new URL("api/request_courier", config.baseUrl.endsWith("/") ? config.baseUrl : `${config.baseUrl}/`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ISHIP_UPSTREAM_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetcher(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.bearerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      // A redirect can replay a POST at the redirected URL. iShip does not
      // document redirects for this endpoint, so fail closed and retain the
      // local reservation as ambiguous instead of risking a second booking.
      redirect: "error",
      signal: controller.signal,
    });
  } catch (error) {
    const timeout = error instanceof Error && error.name === "AbortError";
    throw new IshipApiError({
      code: timeout ? "timeout" : "network",
      ambiguous: true,
      httpStatus: timeout ? 504 : 503,
      message: timeout
        ? "บริการเรียกรถใช้เวลาตอบกลับนานกว่าปกติ ระบบเก็บรายการไว้เพื่อตรวจสอบและจะไม่ส่งคำขอซ้ำอัตโนมัติ"
        : "เชื่อมต่อบริการเรียกรถไม่สำเร็จ ระบบเก็บรายการไว้เพื่อตรวจสอบและจะไม่ส่งคำขอซ้ำอัตโนมัติ",
    });
  } finally {
    clearTimeout(timer);
  }

  const raw = parseJsonText(await response.text());
  const root = recordOf(raw);
  const success = response.ok && (root?.status === true || root?.status === "true");
  const message = responseMessage(raw, success ? "เรียกรถเข้ารับสำเร็จ" : "ผู้ให้บริการไม่รับคำขอเรียกรถเข้ารับ");

  if (!success) {
    const orderRequired = isOrderRequiredMessage(message);
    throw new IshipApiError({
      code: orderRequired ? "order_required" : "provider",
      httpStatus: orderRequired ? 409 : response.ok ? 422 : 502,
      message: orderRequired
        ? "บัญชีบริการเรียกรถยังไม่พร้อมใช้งาน กรุณาติดต่อฝ่ายดูแลระบบแล้วลองใหม่"
        : message,
      rawResponse: raw,
    });
  }

  const data = recordOf(root?.data);
  const ticketPickupId = nullableText(data?.ticketPickupId);
  if (!ticketPickupId) {
    throw new IshipApiError({
      code: "invalid_response",
      message: "ผู้ให้บริการตอบกลับไม่ครบถ้วนและไม่มีเลขที่คำขอ กรุณาติดต่อฝ่ายดูแลระบบ",
      rawResponse: raw,
    });
  }

  return {
    message,
    ticketPickupId,
    recordId: nullableText(data?.id),
    staffInfoName: nullableText(data?.staffInfoName ?? data?.staff_info_name),
    staffInfoPhone: nullableText(data?.staffInfoPhone ?? data?.staff_info_phone),
    timeoutAtText: nullableText(data?.timeoutAtText ?? data?.timeout_at_text),
    ticketMessage: nullableText(data?.ticketMessage ?? data?.ticket_message),
    raw,
  };
}

export async function cancelIshipCourier(
  ticketPickupId: string,
  fetcher: typeof fetch = fetch,
): Promise<{ message: string; raw: unknown }> {
  const config = getIshipConfig();
  const endpoint = new URL(
    `api/cancel-notify/${encodeURIComponent(ticketPickupId)}`,
    config.baseUrl.endsWith("/") ? config.baseUrl : `${config.baseUrl}/`,
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ISHIP_UPSTREAM_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetcher(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.bearerToken}`,
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    const timeout = error instanceof Error && error.name === "AbortError";
    throw new IshipApiError({
      code: timeout ? "timeout" : "network",
      ambiguous: true,
      httpStatus: timeout ? 504 : 503,
      message: timeout
        ? "บริการเรียกรถยังไม่ตอบกลับ จึงยังไม่เปลี่ยนสถานะการยกเลิก กรุณาลองตรวจสอบอีกครั้ง"
        : "เชื่อมต่อบริการเรียกรถไม่สำเร็จ จึงยังไม่เปลี่ยนสถานะการยกเลิก",
    });
  } finally {
    clearTimeout(timer);
  }

  const raw = parseJsonText(await response.text());
  const root = recordOf(raw);
  const success = response.ok && (root?.status === true || root?.status === "true");
  const message = responseMessage(raw, success ? "ยกเลิกการเข้ารับแล้ว" : "ผู้ให้บริการไม่สามารถยกเลิกรายการได้");
  if (!success) {
    throw new IshipApiError({
      code: "provider",
      httpStatus: response.ok ? 422 : 502,
      message,
      rawResponse: raw,
    });
  }
  return { message, raw };
}

export function resolveIshipWebhookStatus(statusCode: unknown, statusText: unknown): IshipPickupStatus | null {
  const raw = `${nullableText(statusCode) ?? ""} ${nullableText(statusText) ?? ""}`.trim().toLowerCase();
  if (!raw) return null;
  if (/cancel|ยกเลิก/.test(raw)) return "cancelled";
  if (/picked[_ -]?up|pickup[_ -]?(complete|success)|รับพัสดุแล้ว|เข้ารับสำเร็จ/.test(raw)) return "picked_up";
  if (/assign|staff|driver|courier[_ -]?found|มอบหมาย|พนักงาน/.test(raw)) return "assigned";
  if (/request|pending|waiting|wait|เรียกรถ|รอ/.test(raw)) return "requested";
  return null;
}

/**
 * iShip courier webhooks may omit a timezone from lifecycle timestamps. Those
 * values describe Thailand operations, so interpret them as Asia/Bangkok
 * (+07:00). Explicit offsets/Z are preserved as supplied.
 */
export function parseIshipWebhookDateTime(value: unknown): Date | null {
  const raw = nullableText(value);
  if (!raw) return null;

  const withoutTimezone = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/.test(raw);
  const candidate = withoutTimezone ? `${raw.replace(" ", "T")}+07:00` : raw;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function resolveIshipWebhookLifecycleTimestamps(input: {
  acceptedAt: unknown;
  closedAt: unknown;
  currentClosedAt: Date | null;
  nextStatus: IshipPickupStatus;
  receivedAt: Date;
}): { acceptedAt?: Date; closedAt?: Date } {
  const acceptedAt = parseIshipWebhookDateTime(input.acceptedAt);
  const providerClosedAt = parseIshipWebhookDateTime(input.closedAt);
  const result: { acceptedAt?: Date; closedAt?: Date } = {};

  if (acceptedAt) result.acceptedAt = acceptedAt;
  if (providerClosedAt) {
    result.closedAt = providerClosedAt;
  } else if (
    !input.currentClosedAt &&
    (input.nextStatus === "picked_up" || input.nextStatus === "cancelled")
  ) {
    result.closedAt = input.receivedAt;
  }
  return result;
}

export function resolveMonotonicPickupStatus(
  current: IshipPickupStatus,
  incoming: IshipPickupStatus | null,
): IshipPickupStatus {
  if (!incoming) return current;
  if (current === "cancelled" || current === "picked_up") return current;
  if (incoming === "cancelled" || incoming === "picked_up") return incoming;
  const rank: Partial<Record<IshipPickupStatus, number>> = { requested: 1, assigned: 2 };
  if ((rank[incoming] ?? 0) < (rank[current] ?? 0)) return current;
  return incoming;
}
