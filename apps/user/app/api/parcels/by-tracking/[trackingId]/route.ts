import { getLegacyParcel, getLegacyTrackingEvents } from "@quickload/shared/legacy";
import { getDb, parcels } from "@quickload/shared/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireLineSession } from "@/lib/require-user";

export async function GET(_: Request, context: { params: Promise<{ trackingId: string }> }) {
  try {
    const session = await requireLineSession();
    const { trackingId } = await context.params;
    const db = getDb();
    const rows = await db
      .select()
      .from(parcels)
      .where(and(eq(parcels.trackingId, trackingId), eq(parcels.userId, session.userId)))
      .limit(1);
    const parcel = rows[0];
    if (!parcel) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    const legacy = await getLegacyParcel(parcel.trackingId);
    const events = await getLegacyTrackingEvents(parcel.trackingId);
    return NextResponse.json({ ok: true, data: { parcel, legacy, events } });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
