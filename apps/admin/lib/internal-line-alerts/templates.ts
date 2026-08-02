function compact(lines: Array<string | null | undefined | false>): string {
  return lines.filter((line): line is string => typeof line === "string" && line.length > 0).join("\n");
}

function amountThb(value: string | number | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return `THB ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function bangkokDateTime(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export type PaymentReceivedTemplateInput = {
  amount: string | number | null;
  paymentMethod?: string | null;
  trackingCode?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  bulk?: boolean;
  itemCount?: number | null;
  paymentId: string;
};

export function paymentReceivedTemplate(input: PaymentReceivedTemplateInput): string {
  const amount = amountThb(input.amount);
  return compact([
    "💰 Money received",
    "",
    `Amount: ${amount}`,
    input.bulk ? `Bulk parcels: ${input.itemCount ?? "-"}` : input.trackingCode ? `Tracking: ${input.trackingCode}` : null,
    input.customerName ? `Customer: ${input.customerName}` : null,
    input.customerPhone ? `Phone: ${input.customerPhone}` : null,
    input.paymentMethod ? `Method: ${input.paymentMethod}` : null,
    "",
    `\nYou poor bastard, do you think ${amount} is enough? NO, IT'S NOT. FIND MORE MONEY.`,
  ]);
}

export type ParcelCreatedTemplateInput = {
  trackingCode?: string | null;
  referenceCode?: string | null;
  senderName?: string | null;
  recipientName?: string | null;
  recipientProvince?: string | null;
  weightGram?: string | number | null;
  parcelType?: string | null;
  parcelId: string;
};

export function parcelCreatedTemplate(input: ParcelCreatedTemplateInput): string {
  const destination = [input.recipientName, input.recipientProvince].filter(Boolean).join(", ");
  return compact([
    "Parcel created",
    "",
    input.trackingCode ? `Tracking: ${input.trackingCode}` : null,
    input.senderName ? `From: ${input.senderName}` : null,
    destination ? `To: ${destination}` : null,
    input.weightGram ? `Weight: ${Number(input.weightGram).toLocaleString("en-US")} g` : null,
    input.parcelType ? `Type: ${input.parcelType}` : null,
    "",
    "\nNow is your chance to become a fucking MILLIONAIRE. Do everything you can to get money from this guy. No excuses.",
  ]);
}

export type PickupLifecycleTemplateInput = {
  action:
    | "requested"
    | "request_failed"
    | "request_unknown"
    | "assigned"
    | "picked_up"
    | "cancelled"
    | "cancel_failed"
    | "cancel_sync_failed";
  source?: "customer" | "provider" | "quickload" | null;
  pickupRequestId: string;
  ticketPickupId?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  parcelCount?: number | null;
  trackingCodes?: string[];
  pickupAddress?: string | null;
  staffInfoName?: string | null;
  staffInfoPhone?: string | null;
  timeoutAtText?: string | null;
  ticketMessage?: string | null;
  providerMessage?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  occurredAt?: Date | string | null;
};

const pickupLifecycleCopy: Record<
  PickupLifecycleTemplateInput["action"],
  { heading: string; status: string }
> = {
  requested: { heading: "🚚 เรียกรถเข้ารับสำเร็จ", status: "รอพนักงานรับงาน" },
  request_failed: { heading: "❌ เรียกรถเข้ารับไม่สำเร็จ", status: "คำขอล้มเหลว" },
  request_unknown: { heading: "⚠️ ไม่ทราบผลคำขอเรียกรถ", status: "ต้องตรวจสอบกับผู้ให้บริการ" },
  assigned: { heading: "🛵 พนักงานรับงานเข้ารับแล้ว", status: "กำลังดำเนินการ" },
  picked_up: { heading: "✅ เข้ารับพัสดุสำเร็จ", status: "รับพัสดุแล้ว" },
  cancelled: { heading: "🚫 ยกเลิกการเข้ารับพัสดุ", status: "ยกเลิกสำเร็จ" },
  cancel_failed: { heading: "⚠️ ยกเลิกการเข้ารับไม่สำเร็จ", status: "คำขอยังมีผลอยู่" },
  cancel_sync_failed: {
    heading: "🚨 ยกเลิกกับผู้ให้บริการแล้ว แต่บันทึกไม่สำเร็จ",
    status: "ต้องตรวจสอบ Quickload ทันที",
  },
};

function pickupSourceLabel(source: PickupLifecycleTemplateInput["source"]): string | null {
  if (source === "customer") return "ลูกค้า";
  if (source === "provider") return "ผู้ให้บริการ";
  if (source === "quickload") return "ระบบ Quickload";
  return null;
}

export function pickupLifecycleTemplate(input: PickupLifecycleTemplateInput): string {
  const copy = pickupLifecycleCopy[input.action];
  const heading =
    input.action === "cancelled" && input.source === "customer"
      ? `ควย!! ${copy.heading}`
      : copy.heading;
  const trackingCodes = Array.from(new Set(input.trackingCodes?.filter(Boolean) ?? []));
  const visibleTrackingCodes = trackingCodes.slice(0, 8);
  const trackingLine = visibleTrackingCodes.length
    ? `${visibleTrackingCodes.join(", ")}${trackingCodes.length > visibleTrackingCodes.length ? ` +${trackingCodes.length - visibleTrackingCodes.length}` : ""}`
    : null;
  const sourceLabel = pickupSourceLabel(input.source);
  const occurredAt = bangkokDateTime(input.occurredAt);
  const isFailure = ["request_failed", "request_unknown", "cancel_failed", "cancel_sync_failed"].includes(
    input.action,
  );

  return compact([
    heading,
    "",
    input.ticketPickupId ? `Ticket: #${input.ticketPickupId}` : `Request: ${input.pickupRequestId}`,
    input.contactName ? `ลูกค้า: ${input.contactName}` : null,
    input.contactPhone ? `โทร: ${input.contactPhone}` : null,
    input.parcelCount != null ? `จำนวน: ${input.parcelCount.toLocaleString("th-TH")} ชิ้น` : null,
    trackingLine ? `พัสดุ: ${trackingLine}` : null,
    input.pickupAddress ? `ที่อยู่เข้ารับ: ${input.pickupAddress.slice(0, 350)}` : null,
    input.staffInfoName ? `พนักงานเข้ารับ: ${input.staffInfoName}` : null,
    input.staffInfoPhone ? `เบอร์พนักงาน: ${input.staffInfoPhone}` : null,
    input.timeoutAtText ? `เวลาประมาณการ: ${input.timeoutAtText}` : null,
    input.ticketMessage ? `ข้อมูลการเข้ารับ: ${input.ticketMessage.slice(0, 500)}` : null,
    input.action === "cancelled" && sourceLabel ? `ยกเลิกโดย: ${sourceLabel}` : null,
    isFailure && sourceLabel ? `จุดที่เกิดปัญหา: ${sourceLabel}` : null,
    input.failureCode ? `รหัสข้อผิดพลาด: ${input.failureCode}` : null,
    input.failureMessage ? `สาเหตุ: ${input.failureMessage.slice(0, 600)}` : null,
    !isFailure && input.providerMessage ? `ข้อความจากผู้ให้บริการ: ${input.providerMessage.slice(0, 500)}` : null,
    occurredAt ? `เวลา: ${occurredAt}` : null,
    "",
    `สถานะ: ${copy.status}`,
  ]);
}

export type UserRegisteredTemplateInput = {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  userId: string;
};

export function userRegisteredTemplate(input: UserRegisteredTemplateInput): string {
  const fullName = [input.firstName, input.lastName].filter(Boolean).join(" ").trim();
  return compact([
    "New user registered",
    "",
    fullName ? `Name: ${fullName}` : input.displayName ? `LINE: ${input.displayName}` : null,
    input.phone ? `Phone: ${input.phone}` : null,
    input.email ? `Email: ${input.email}` : null,
    "",
    "\nGET MONEY FROM THIS GUY, EVEN IF WE HAVE TO SUCK HIS DICK.",
  ]);
}

export type CriticalErrorTemplateInput = {
  source?: string | null;
  severity?: string | null;
  message?: string | null;
  context?: unknown;
  eventKey: string;
};

export function criticalErrorTemplate(input: CriticalErrorTemplateInput): string {
  const context =
    input.context && typeof input.context === "object"
      ? JSON.stringify(input.context).slice(0, 500)
      : null;
  const isWarning = input.severity?.toLowerCase() === "warning";
  return compact([
    "System error",
    "",
    input.severity ? `Severity: ${input.severity}` : null,
    input.source ? `Source: ${input.source}` : null,
    input.message ? `Message: ${input.message.slice(0, 600)}` : null,
    context ? `Context: ${context}` : null,
    `Event: ${input.eventKey}`,
    "",
    isWarning ? "\nเกิดเหี้ยไรวะเย็ดเข้ แก้ให้ไวเลยนะ" : "\nรีบไปแก้บัค ไอชิบหาย!!",
  ]);
}
