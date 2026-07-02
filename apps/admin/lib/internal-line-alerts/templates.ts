function envLabel(): string {
  const raw = process.env.APP_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV || "local";
  if (raw === "production") return "PROD";
  if (raw === "preview") return "PREVIEW";
  if (raw === "development") return "LOCAL";
  return raw.toUpperCase();
}

function compact(lines: Array<string | null | undefined | false>): string {
  return lines.filter((line): line is string => typeof line === "string" && line.length > 0).join("\n");
}

function amountThb(value: string | number | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return `THB ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  return compact([
    `[${envLabel()}] Money received`,
    "",
    `Amount: ${amountThb(input.amount)}`,
    input.bulk ? `Bulk parcels: ${input.itemCount ?? "-"}` : input.trackingCode ? `Tracking: ${input.trackingCode}` : null,
    input.customerName ? `Customer: ${input.customerName}` : null,
    input.customerPhone ? `Phone: ${input.customerPhone}` : null,
    input.paymentMethod ? `Method: ${input.paymentMethod}` : null,
    `Payment ID: ${input.paymentId}`,
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
    `[${envLabel()}] Parcel created`,
    "",
    input.trackingCode ? `Tracking: ${input.trackingCode}` : null,
    input.referenceCode ? `Reference: ${input.referenceCode}` : null,
    input.senderName ? `From: ${input.senderName}` : null,
    destination ? `To: ${destination}` : null,
    input.weightGram ? `Weight: ${Number(input.weightGram).toLocaleString("en-US")} g` : null,
    input.parcelType ? `Type: ${input.parcelType}` : null,
    `Parcel ID: ${input.parcelId}`,
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
    `[${envLabel()}] New user registered`,
    "",
    fullName ? `Name: ${fullName}` : input.displayName ? `LINE: ${input.displayName}` : null,
    input.phone ? `Phone: ${input.phone}` : null,
    input.email ? `Email: ${input.email}` : null,
    `User ID: ${input.userId}`,
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
  return compact([
    `[${envLabel()}] System error`,
    "",
    input.severity ? `Severity: ${input.severity}` : null,
    input.source ? `Source: ${input.source}` : null,
    input.message ? `Message: ${input.message.slice(0, 600)}` : null,
    context ? `Context: ${context}` : null,
    `Event: ${input.eventKey}`,
  ]);
}
