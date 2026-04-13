import { getDb, pickupSlots } from "@quickload/shared/db";
import { and, eq, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireLineSession } from "@/lib/require-user";

export async function GET() {
  try {
    await requireLineSession();
    const db = getDb();
    const rows = await db
      .select()
      .from(pickupSlots)
      .where(and(eq(pickupSlots.isActive, true), lt(pickupSlots.bookedCount, pickupSlots.maxCapacity)));
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
