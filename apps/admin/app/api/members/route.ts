import { users } from "@quickload/shared/db/schema";
import { getDb } from "@quickload/shared/db";
import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/require-admin";

export async function GET() {
  try {
    await requireAdminUser();
    const db = getDb();
    const rows = await db.select().from(users).orderBy(desc(users.createdAt)).limit(500);
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
