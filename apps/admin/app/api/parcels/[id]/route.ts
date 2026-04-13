import { pushAndLogLineMessage } from "@quickload/shared/notifications";
import { parcels, users } from "@quickload/shared/db/schema";
import { getDb } from "@quickload/shared/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/require-admin";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminUser();
    const { id } = await context.params;
    const db = getDb();
    const rows = await db.select().from(parcels).where(eq(parcels.id, id)).limit(1);
    const parcel = rows[0];
    if (!parcel) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, data: parcel });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminUser();
    const { id } = await context.params;
    const body = (await request.json()) as { status?: string };
    if (!body.status) {
      return NextResponse.json({ ok: false, error: "status required" }, { status: 400 });
    }

    const db = getDb();
    const existingRows = await db.select().from(parcels).where(eq(parcels.id, id)).limit(1);
    const existing = existingRows[0];
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const prevStatus = existing.status;
    await db
      .update(parcels)
      .set({ status: body.status, updatedAt: new Date() })
      .where(eq(parcels.id, id));

    if (prevStatus !== body.status && existing.userId) {
      const userRows = await db.select().from(users).where(eq(users.id, existing.userId)).limit(1);
      const u = userRows[0];
      if (u) {
        await pushAndLogLineMessage({
          userId: u.id,
          lineUserId: u.lineUserId,
          type: "parcel_status",
          message: { type: "text", text: `Parcel ${existing.trackingId} is now: ${body.status}` },
          payload: { parcelId: id, from: prevStatus, to: body.status },
        });
      }
    }

    const updatedRows = await db.select().from(parcels).where(eq(parcels.id, id)).limit(1);
    return NextResponse.json({ ok: true, data: updatedRows[0] });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
