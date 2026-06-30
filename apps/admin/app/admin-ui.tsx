import Link from "next/link";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<Tone, string> = {
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-rose-200 bg-rose-50 text-rose-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
};

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatMoney(value: string | number | null | undefined) {
  if (value == null) return "-";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  return `THB ${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export function statusLabel(status: string | null | undefined) {
  const normalized = status ?? "";
  const labels: Record<string, string> = {
    awaiting_actual_weight: "Awaiting price",
    pending_payment: "Payment due",
    paid: "Paid",
    registered: "Registered",
    in_transit: "In transit",
    delivered: "Delivered",
    failed: "Failed",
    canceled: "Canceled",
    draft: "Draft",
  };
  return labels[normalized] ?? (normalized.replace(/_/g, " ") || "-");
}

export function statusTone(status: string | null | undefined): Tone {
  if (status === "delivered" || status === "paid") return "success";
  if (status === "pending_payment" || status === "awaiting_actual_weight") return "warning";
  if (status === "failed" || status === "canceled") return "danger";
  if (status === "in_transit" || status === "registered") return "info";
  return "neutral";
}

export function StatusPill({ status }: { status: string | null | undefined }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium", toneClasses[statusTone(status)])}>
      {statusLabel(status)}
    </span>
  );
}

export function PaymentPill({
  isPaid,
  price,
  amountPaid,
}: {
  isPaid: boolean;
  price?: string | number | null;
  amountPaid?: string | number | null;
}) {
  const owed = Number(price ?? 0);
  const paid = Number(amountPaid ?? 0);
  const hasPrice = Number.isFinite(owed) && owed > 0;
  const settled = isPaid || (hasPrice && Number.isFinite(paid) && paid >= owed);
  const tone: Tone = settled ? "success" : hasPrice ? "warning" : "neutral";
  const label = settled ? "Paid" : hasPrice ? "Unpaid" : "No price";

  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium", toneClasses[tone])}>
      {label}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal text-slate-950">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
    >
      {children}
    </Link>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
      <p className="text-sm font-medium text-slate-900">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
}
