import { getDb, parcels } from "@quickload/shared/db";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { CacheHeaders, jsonWithCache } from "@/lib/api-cache";
import { requireLineSession } from "@/lib/require-user";

export async function GET() {
  try {
    const session = await requireLineSession();
    const db = getDb();
    const rows = await db
      .select()
      .from(parcels)
      .where(eq(parcels.userId, session.userId))
      .orderBy(desc(parcels.createdAt));
    return jsonWithCache({ ok: true, data: rows }, CacheHeaders.privateShortSwr(10, 30));
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
