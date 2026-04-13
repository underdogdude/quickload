import { getDb, parcels } from "@quickload/shared/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireLineSession } from "@/lib/require-user";

export async function GET() {
  try {
    const session = await requireLineSession();
    const db = getDb();
    const rows = await db.select().from(parcels).where(eq(parcels.userId, session.userId));
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireLineSession();
    const body = (await request.json()) as {
      trackingId: string;
      destination?: string;
      weightKg?: string;
      size?: string;
      price?: string;
    };
    if (!body.trackingId?.trim()) {
      return NextResponse.json({ ok: false, error: "trackingId required" }, { status: 400 });
    }
    const db = getDb();
    const inserted = await db
      .insert(parcels)
      .values({
        trackingId: body.trackingId.trim(),
        userId: session.userId,
        destination: body.destination ?? null,
        weightKg: body.weightKg ?? null,
        size: body.size ?? null,
        price: body.price ?? null,
        source: "self",
      })
      .returning();
    return NextResponse.json({ ok: true, data: inserted[0] });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
