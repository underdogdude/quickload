import {
  EmptyState,
  PageHeader,
  PaymentPill,
  PrimaryLink,
  StatusPill,
  cn,
  formatDateTime,
  formatMoney,
  statusLabel,
} from "@/app/admin-ui";
import { getDb } from "@quickload/shared/db";
import { orders, parcels, thaiPostWebhookEvents, users } from "@quickload/shared/db/schema";
import { count, desc, eq, or, sql } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";

export const dynamic = "force-dynamic";

type DashboardRow = {
  id: string;
  trackingId: string;
  barcode: string | null;
  status: string;
  isPaid: boolean;
  price: string | null;
  amountPaid: string;
  destination: string | null;
  thaiPostPriceConfirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  customerPictureUrl: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  recipientProvince: string | null;
  recipientZipcode: string | null;
  statusDescription: string | null;
};

const confirmedPricePredicate = sql`${parcels.thaiPostPriceConfirmedAt} is not null and ${parcels.price} is not null`;

const overduePaymentPredicate = sql`${parcels.thaiPostPriceConfirmedAt} is not null
  and ${parcels.price} is not null
  and (${parcels.isPaid} = false or ${parcels.amountPaid} < ${parcels.price})`;

function toNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function metricDelta(label: string, value: number) {
  return value === 0 ? "No open exceptions" : `${value.toLocaleString("en-US")} ${label}`;
}

function personName(row: DashboardRow) {
  return row.customerName ?? row.recipientName ?? "Unknown customer";
}

function contactLine(row: DashboardRow) {
  return row.customerPhone ?? row.recipientPhone ?? row.customerEmail ?? row.destination ?? "No contact detail";
}

function destinationLine(row: DashboardRow) {
  return [row.destination, row.recipientProvince, row.recipientZipcode].filter(Boolean).join(", ") || "No destination detail";
}

function outstandingAmount(row: DashboardRow) {
  return Math.max(0, toNumber(row.price) - toNumber(row.amountPaid));
}

function daysSince(value: Date | null) {
  if (!value) return 0;
  const elapsed = Date.now() - value.getTime();
  if (!Number.isFinite(elapsed) || elapsed <= 0) return 0;
  return Math.floor(elapsed / 86_400_000);
}

function overdueLabel(value: Date | null) {
  const days = daysSince(value);
  if (days <= 0) return "ค้างชำระวันนี้";
  return `ค้างชำระ ${days.toLocaleString("th-TH")} วัน`;
}

function initials(row: DashboardRow) {
  const name = personName(row).trim();
  if (!name || name === "Unknown customer") return "?";
  return Array.from(name).slice(0, 2).join("").toUpperCase();
}

function CustomerAvatar({ row }: { row: DashboardRow }) {
  if (row.customerPictureUrl) {
    return (
      <Image
        src={row.customerPictureUrl}
        alt=""
        width={48}
        height={48}
        className="h-12 w-12 rounded-full border border-slate-200 bg-slate-100 object-cover"
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-sm font-semibold text-slate-600">
      {initials(row)}
    </div>
  );
}

function OverdueBadge({ confirmedAt }: { confirmedAt: Date | null }) {
  const days = daysSince(confirmedAt);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        days >= 3 ? "border-rose-200 bg-rose-50 text-rose-800" : "border-amber-200 bg-amber-50 text-amber-900",
      )}
    >
      {overdueLabel(confirmedAt)}
    </span>
  );
}

function AttentionReason({ row }: { row: DashboardRow }) {
  const price = Number(row.price ?? 0);
  if ((row.status === "failed" || row.status === "canceled") && !row.isPaid) {
    return <span className="text-rose-700">Delivery exception with unresolved payment</span>;
  }
  if (row.status === "failed" || row.status === "canceled") {
    return <span className="text-rose-700">Carrier marked this parcel as {statusLabel(row.status).toLowerCase()}</span>;
  }
  if (!row.isPaid && Number.isFinite(price) && price > 0) {
    return <span className="text-amber-800">Customer still owes {formatMoney(row.price)}</span>;
  }
  if (row.status === "awaiting_actual_weight") {
    return <span className="text-amber-800">Waiting for carrier weight and final price</span>;
  }
  return <span className="text-slate-600">Needs staff review</span>;
}

export default async function DashboardPage() {
  const db = getDb();

  const [summary] = await db
    .select({
      total: count(parcels.id),
      overdueUnpaid: sql<number>`count(*) filter (where ${overduePaymentPredicate})`,
      totalMoney: sql<string>`coalesce(sum(${parcels.price}) filter (where ${confirmedPricePredicate}), 0)`,
      moneyToReceive: sql<string>`coalesce(sum(greatest(${parcels.price} - ${parcels.amountPaid}, 0)) filter (where ${confirmedPricePredicate}), 0)`,
      moneyCurrentlyHave: sql<string>`coalesce(sum(${parcels.amountPaid}), 0)`,
      awaitingPrice: sql<number>`count(*) filter (where ${parcels.status} = 'awaiting_actual_weight')`,
      inTransit: sql<number>`count(*) filter (where ${parcels.status} = 'in_transit')`,
      failedOrCanceled: sql<number>`count(*) filter (where ${parcels.status} in ('failed', 'canceled'))`,
      paid: sql<number>`count(*) filter (where ${parcels.isPaid} = true)`,
    })
    .from(parcels);

  const overdueRows = await db
    .select({
      id: parcels.id,
      trackingId: parcels.trackingId,
      barcode: parcels.barcode,
      status: parcels.status,
      isPaid: parcels.isPaid,
      price: parcels.price,
      amountPaid: parcels.amountPaid,
      destination: parcels.destination,
      thaiPostPriceConfirmedAt: parcels.thaiPostPriceConfirmedAt,
      createdAt: parcels.createdAt,
      updatedAt: parcels.updatedAt,
      customerName: users.displayName,
      customerPhone: users.phone,
      customerEmail: users.email,
      customerPictureUrl: users.pictureUrl,
      recipientName: orders.cusName,
      recipientPhone: orders.cusTel,
      recipientProvince: orders.cusProv,
      recipientZipcode: orders.cusZipcode,
      statusDescription: thaiPostWebhookEvents.statusDescription,
    })
    .from(parcels)
    .leftJoin(users, eq(parcels.userId, users.id))
    .leftJoin(orders, eq(orders.parcelId, parcels.id))
    .leftJoin(thaiPostWebhookEvents, eq(thaiPostWebhookEvents.parcelId, parcels.id))
    .where(overduePaymentPredicate)
    .orderBy(desc(parcels.thaiPostPriceConfirmedAt))
    .limit(8);

  const attentionRows = await db
    .select({
      id: parcels.id,
      trackingId: parcels.trackingId,
      barcode: parcels.barcode,
      status: parcels.status,
      isPaid: parcels.isPaid,
      price: parcels.price,
      amountPaid: parcels.amountPaid,
      destination: parcels.destination,
      thaiPostPriceConfirmedAt: parcels.thaiPostPriceConfirmedAt,
      createdAt: parcels.createdAt,
      updatedAt: parcels.updatedAt,
      customerName: users.displayName,
      customerPhone: users.phone,
      customerEmail: users.email,
      customerPictureUrl: users.pictureUrl,
      recipientName: orders.cusName,
      recipientPhone: orders.cusTel,
      recipientProvince: orders.cusProv,
      recipientZipcode: orders.cusZipcode,
      statusDescription: thaiPostWebhookEvents.statusDescription,
    })
    .from(parcels)
    .leftJoin(users, eq(parcels.userId, users.id))
    .leftJoin(orders, eq(orders.parcelId, parcels.id))
    .leftJoin(thaiPostWebhookEvents, eq(thaiPostWebhookEvents.parcelId, parcels.id))
    .where(
      or(
        eq(parcels.status, "awaiting_actual_weight"),
        eq(parcels.status, "failed"),
        eq(parcels.status, "canceled"),
      ),
    )
    .orderBy(desc(sql`coalesce(${parcels.updatedAt}, ${parcels.createdAt})`))
    .limit(8);

  const recentRows = await db
    .select({
      id: parcels.id,
      trackingId: parcels.trackingId,
      barcode: parcels.barcode,
      status: parcels.status,
      isPaid: parcels.isPaid,
      price: parcels.price,
      amountPaid: parcels.amountPaid,
      destination: parcels.destination,
      thaiPostPriceConfirmedAt: parcels.thaiPostPriceConfirmedAt,
      createdAt: parcels.createdAt,
      updatedAt: parcels.updatedAt,
      customerName: users.displayName,
      customerPhone: users.phone,
      customerEmail: users.email,
      customerPictureUrl: users.pictureUrl,
      recipientName: orders.cusName,
      recipientPhone: orders.cusTel,
      recipientProvince: orders.cusProv,
      recipientZipcode: orders.cusZipcode,
      statusDescription: thaiPostWebhookEvents.statusDescription,
    })
    .from(parcels)
    .leftJoin(users, eq(parcels.userId, users.id))
    .leftJoin(orders, eq(orders.parcelId, parcels.id))
    .leftJoin(thaiPostWebhookEvents, eq(thaiPostWebhookEvents.parcelId, parcels.id))
    .orderBy(desc(sql`coalesce(${parcels.updatedAt}, ${parcels.createdAt})`))
    .limit(12);

  const total = toNumber(summary?.total);
  const overdueUnpaid = toNumber(summary?.overdueUnpaid);
  const awaitingPrice = toNumber(summary?.awaitingPrice);
  const inTransit = toNumber(summary?.inTransit);
  const failedOrCanceled = toNumber(summary?.failedOrCanceled);
  const paid = toNumber(summary?.paid);
  const totalMoney = toNumber(summary?.totalMoney);
  const moneyToReceive = toNumber(summary?.moneyToReceive);
  const moneyCurrentlyHave = toNumber(summary?.moneyCurrentlyHave);
  const exceptionCount = overdueUnpaid + awaitingPrice + failedOrCanceled;

  const moneyMetrics = [
    { label: "Total confirmed", value: totalMoney, detail: "All parcels with confirmed final price", tone: "neutral" },
    { label: "Outstanding receivable", value: moneyToReceive, detail: "เงินที่ควรได้รับ แต่ยังไม่ได้รับครบ", tone: "warning" },
    { label: "Collected in system", value: moneyCurrentlyHave, detail: "เงินที่รับแล้วตามสถานะ payment", tone: "success" },
  ];

  const metrics = [
    { label: "Total parcels", value: total, detail: `${paid.toLocaleString("en-US")} paid` },
    { label: "ค้างชำระ", value: overdueUnpaid, detail: "ไปรษณีย์ส่งน้ำหนักจริงแล้ว", emphasis: overdueUnpaid > 0 },
    { label: "Needs attention", value: exceptionCount, detail: metricDelta("open items", exceptionCount), emphasis: exceptionCount > 0 },
    { label: "Awaiting price", value: awaitingPrice, detail: "Waiting for actual weight" },
    { label: "In transit", value: inTransit, detail: "Carrier progress active" },
    { label: "Failed or canceled", value: failedOrCanceled, detail: metricDelta("exceptions", failedOrCanceled), danger: failedOrCanceled > 0 },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Operations dashboard"
        description="Production parcel flow, payment state, and carrier exceptions. ค้างชำระ means payment is still incomplete after Thailand Post has confirmed actual weight and final price."
        action={<PrimaryLink href="/parcels">Open parcels</PrimaryLink>}
      />

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-col gap-1 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Revenue position</h2>
            <p className="mt-1 text-sm text-slate-600">Confirmed charges, money still owed, and money already collected.</p>
          </div>
          <span className="text-sm font-medium text-slate-500">Production totals</span>
        </div>
        <div className="grid divide-y divide-slate-100 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {moneyMetrics.map((metric) => (
            <div
              key={metric.label}
              className={cn(
                "p-5",
                metric.tone === "warning"
                  ? "bg-amber-50/70"
                  : metric.tone === "success"
                    ? "bg-emerald-50/70"
                    : "bg-white",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <p
                  className={cn(
                    "text-sm font-semibold",
                    metric.tone === "warning" ? "text-amber-900" : metric.tone === "success" ? "text-emerald-900" : "text-slate-700",
                  )}
                >
                  {metric.label}
                </p>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-semibold",
                    metric.tone === "warning"
                      ? "bg-amber-100 text-amber-950"
                      : metric.tone === "success"
                        ? "bg-emerald-100 text-emerald-950"
                        : "bg-slate-100 text-slate-700",
                  )}
                >
                  THB
                </span>
              </div>
              <p className="mt-4 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">{formatMoney(metric.value).replace("THB ", "")}</p>
              <p className="mt-3 text-sm leading-5 text-slate-600">{metric.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className={cn(
              "rounded-lg border bg-white p-4",
              metric.emphasis ? "border-amber-300" : metric.danger ? "border-rose-300" : "border-slate-200",
            )}
          >
            <p className="text-sm font-medium text-slate-600">{metric.label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-normal text-slate-950">{metric.value.toLocaleString("en-US")}</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">{metric.detail}</p>
          </div>
        ))}
      </section>

      <section>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">ค้างชำระหลังไปรษณีย์ยืนยันน้ำหนักจริง</h2>
            <p className="mt-1 text-sm text-slate-600">รายการที่มีราคาจริงแล้ว แต่ยังไม่ได้ชำระครบในระบบ</p>
          </div>
          <span className="text-sm text-slate-500">{overdueRows.length} shown</span>
        </div>
        {overdueRows.length === 0 ? (
          <EmptyState title="ไม่มีรายการค้างชำระ" description="ถ้าไปรษณีย์ส่งน้ำหนักจริงมาแล้วและลูกค้ายังไม่ชำระ รายการจะขึ้นที่นี่ทันที." />
        ) : (
          <div className="overflow-hidden rounded-lg border border-amber-200 bg-white">
            <div className="divide-y divide-slate-100">
              {overdueRows.map((row) => (
                <Link key={row.id} href={`/parcels/${row.id}`} className="block px-4 py-4 transition hover:bg-amber-50/50">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <CustomerAvatar row={row} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-mono text-sm font-semibold text-slate-950">{row.barcode ?? row.trackingId}</p>
                          <OverdueBadge confirmedAt={row.thaiPostPriceConfirmedAt} />
                          <PaymentPill isPaid={row.isPaid} price={row.price} amountPaid={row.amountPaid} />
                          <StatusPill status={row.status} />
                        </div>
                        <p className="mt-2 text-sm font-semibold text-slate-900">{personName(row)}</p>
                        <p className="mt-1 text-sm text-slate-600">{contactLine(row)}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          Recipient: {row.recipientName ?? "Unknown"} {row.recipientPhone ? `· ${row.recipientPhone}` : ""}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{destinationLine(row)}</p>
                      </div>
                    </div>
                    <div className="grid gap-3 text-sm sm:grid-cols-3 lg:min-w-[420px] lg:text-right">
                      <div>
                        <p className="text-xs font-medium text-slate-500">Outstanding</p>
                        <p className="mt-1 font-semibold text-rose-700">{formatMoney(outstandingAmount(row))}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-500">Final price</p>
                        <p className="mt-1 font-medium text-slate-900">{formatMoney(row.price)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-500">Confirmed</p>
                        <p className="mt-1 font-medium text-slate-900">{formatDateTime(row.thaiPostPriceConfirmedAt)}</p>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-950">Other operational exceptions</h2>
            <span className="text-sm text-slate-500">{attentionRows.length} shown</span>
          </div>
          {attentionRows.length === 0 ? (
            <EmptyState title="No open operational exceptions" description="Missing-price parcels and carrier exceptions will appear here as soon as they need staff review." />
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="divide-y divide-slate-100">
                {attentionRows.map((row) => (
                  <Link key={row.id} href={`/parcels/${row.id}`} className="block px-4 py-4 transition hover:bg-slate-50">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-mono text-sm font-semibold text-slate-950">{row.barcode ?? row.trackingId}</p>
                          <StatusPill status={row.status} />
                          <PaymentPill isPaid={row.isPaid} price={row.price} amountPaid={row.amountPaid} />
                        </div>
                        <p className="mt-2 text-sm font-medium text-slate-800">{personName(row)}</p>
                        <p className="mt-1 text-sm text-slate-500">{contactLine(row)}</p>
                      </div>
                      <div className="text-left sm:min-w-48 sm:text-right">
                        <p className="text-sm font-medium text-slate-900">{formatMoney(row.price)}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatDateTime(row.updatedAt ?? row.createdAt)}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-sm">
                      <AttentionReason row={row} />
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-950">Recent activity</h2>
            <Link href="/parcels" className="text-sm font-medium text-emerald-700 hover:text-emerald-900">
              View all
            </Link>
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Parcel</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/parcels/${row.id}`} className="font-mono text-sm font-medium text-slate-950 hover:text-emerald-800">
                        {row.barcode ?? row.trackingId}
                      </Link>
                      <p className="mt-1 text-xs text-slate-500">{personName(row)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <StatusPill status={row.status} />
                        <PaymentPill isPaid={row.isPaid} price={row.price} amountPaid={row.amountPaid} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-slate-500">{formatDateTime(row.updatedAt ?? row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {recentRows.length === 0 ? (
              <div className="border-t border-slate-100 px-4 py-8">
                <EmptyState title="No parcels yet" description="New production parcels will appear here after they are registered." />
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
