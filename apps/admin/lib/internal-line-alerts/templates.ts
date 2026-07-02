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
