import { pushAndLogLineMessage } from "@quickload/shared/notifications";
import { users } from "@quickload/shared/db/schema";
import { getDb } from "@quickload/shared/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/require-admin";

export async function POST(request: Request) {
  try {
    await requireAdminUser();
    const body = (await request.json()) as { userId: string; text: string };
    if (!body.userId || !body.text?.trim()) {
      return NextResponse.json({ ok: false, error: "userId and text required" }, { status: 400 });
    }
    const db = getDb();
    const rows = await db.select().from(users).where(eq(users.id, body.userId)).limit(1);
    const u = rows[0];
    if (!u) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }
    const result = await pushAndLogLineMessage({
      userId: u.id,
      lineUserId: u.lineUserId,
      type: "parcel_status",
      message: { type: "text", text: body.text.trim() },
      payload: { manual: true },
    });
    return NextResponse.json({ ok: result.ok, data: result });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
