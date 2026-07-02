import { parcels } from "@quickload/shared/db/schema";
import { getDb } from "@quickload/shared/db";
import { recordInternalEvent, recordSystemErrorEvent } from "@quickload/shared/internal-events";
import { desc, ilike, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/require-admin";

export async function GET(request: Request) {
  try {
    await requireAdminUser();
       const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim();
    const db = getDb();
    const rows = q
      ? await db
          .select()
          .from(parcels)
          .where(or(ilike(parcels.trackingId, `%${q}%`), ilike(parcels.destination, `%${q}%`)))
          .orderBy(desc(parcels.createdAt))
          .limit(200)
      : await db.select().from(parcels).orderBy(desc(parcels.createdAt)).limit(200);
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminUser();
    const body = (await request.json()) as {
      trackingId: string;
      userId?: string | null;
      destination?: string;
      status?: string;
      source?: string;
    };
    if (!body.trackingId?.trim()) {
      return NextResponse.json({ ok: false, error: "trackingId required" }, { status: 400 });
    }
    const db = getDb();
    const inserted = await db
      .insert(parcels)
      .values({
        trackingId: body.trackingId.trim(),
        userId: body.userId ?? null,
        destination: body.destination ?? null,
        status: body.status ?? "registered",
        source: body.source ?? "self",
      })
      .returning();
    const parcel = inserted[0];
    if (parcel) {
      await recordInternalEvent("parcel.created", `parcel.created:${parcel.id}`, {
        parcelId: parcel.id,
        userId: parcel.userId,
        trackingId: parcel.trackingId,
        barcode: parcel.barcode,
        destination: parcel.destination,
        source: parcel.source,
      });
    }
    return NextResponse.json({ ok: true, data: parcel });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    await recordSystemErrorEvent({
      source: "admin.api.parcels",
      error: e,
    });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
