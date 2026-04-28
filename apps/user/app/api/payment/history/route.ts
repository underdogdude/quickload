import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, orders, parcels, payments } from "@quickload/shared/db";
import { NextResponse } from "next/server";
import { requireLineSession } from "@/lib/require-user";

const MAX_ROWS = 100;

export async function GET() {
  try {
    const session = await requireLineSession();
    const db = getDb();

    const rows = await db
      .select({
        paymentId: payments.id,
        amount: payments.amount,
        currency: payments.currency,
        paymentMethod: payments.paymentMethod,
        provider: payments.provider,
        status: payments.status,
        paidAt: payments.paidAt,
        createdAt: payments.createdAt,
        parcelId: parcels.id,
        trackingId: parcels.trackingId,
        barcode: parcels.barcode,
        destination: parcels.destination,
      })
      .from(payments)
      .innerJoin(parcels, eq(payments.parcelId, parcels.id))
      .where(and(eq(parcels.userId, session.userId), eq(payments.status, "succeeded")))
      .orderBy(desc(payments.paidAt), desc(payments.createdAt))
      .limit(MAX_ROWS);

    const parcelIds = rows.map((r) => r.parcelId);
    const orderMap = new Map<string, { senderName: string | null; recipientName: string | null }>();
    if (parcelIds.length > 0) {
      const orderRows = await db
        .select({
          parcelId: orders.parcelId,
          senderName: orders.shipperName,
          recipientName: orders.cusName,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .where(inArray(orders.parcelId, parcelIds))
        .orderBy(desc(orders.createdAt));
      for (const o of orderRows) {
        if (!orderMap.has(o.parcelId)) {
          orderMap.set(o.parcelId, {
            senderName: o.senderName?.trim() || null,
            recipientName: o.recipientName?.trim() || null,
          });
        }
      }
    }

    let totalPaid = 0;
    const items = rows.map((r) => {
      const amt = Number(r.amount);
      if (Number.isFinite(amt)) totalPaid += amt;
      const displayCode = r.barcode?.trim() || r.trackingId;
      const order = orderMap.get(r.parcelId);
      return {
        paymentId: r.paymentId,
        parcelId: r.parcelId,
        displayCode,
        destination: r.destination,
        senderName: order?.senderName ?? null,
        recipientName: order?.recipientName ?? null,
        amount: String(r.amount),
        currency: r.currency,
        paymentMethod: r.paymentMethod,
        provider: r.provider,
        paidAt: r.paidAt?.toISOString() ?? r.createdAt.toISOString(),
      };
    });

    return NextResponse.json({
      ok: true,
      data: {
        totalPaid,
        itemCount: items.length,
        items,
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
