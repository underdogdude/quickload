import { pickupSlots } from "@quickload/shared/db/schema";
import { getDb } from "@quickload/shared/db";
import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/require-admin";

export async function GET() {
  try {
    await requireAdminUser();
    const db = getDb();
    const rows = await db.select().from(pickupSlots).orderBy(desc(pickupSlots.date)).limit(200);
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
      date: string;
      timeWindow: string;
      maxCapacity?: number;
      isActive?: boolean;
    };
    if (!body.date || !body.timeWindow) {
      return NextResponse.json({ ok: false, error: "date and timeWindow required" }, { status: 400 });
    }
    const db = getDb();
    const inserted = await db
      .insert(pickupSlots)
      .values({
        date: body.date,
        timeWindow: body.timeWindow,
        maxCapacity: body.maxCapacity ?? 10,
        isActive: body.isActive ?? true,
      })
      .returning();
    return NextResponse.json({ ok: true, data: inserted[0] });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
