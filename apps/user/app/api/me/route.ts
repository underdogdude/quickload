import { getDb, users } from "@quickload/shared/db";
import { eq } from "drizzle-orm";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireLineSession } from "@/lib/require-user";
import type { LineAppSession } from "@/lib/session";
import { getSessionOptions } from "@/lib/session";

export async function GET() {
  try {
    const session = await requireLineSession();
    const db = getDb();
    const rows = await db
      .select({
        id: users.id,
        lineUserId: users.lineUserId,
        displayName: users.displayName,
        pictureUrl: users.pictureUrl,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
      })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);
    const user = rows[0];
    if (!user) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, data: user });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireLineSession();
    const body = (await request.json()) as { firstName?: string; lastName?: string; phone?: string };
    const firstName = body.firstName?.trim();
    const lastName = body.lastName?.trim();
    const phone = body.phone?.trim();
    if (!firstName || !lastName || !phone) {
      return NextResponse.json({ ok: false, error: "firstName, lastName, phone are required" }, { status: 400 });
    }

    const db = getDb();
    const updatedRows = await db
      .update(users)
      .set({
        firstName,
        lastName,
        phone,
        updatedAt: new Date(),
      })
      .where(eq(users.id, session.userId))
      .returning({
        id: users.id,
        lineUserId: users.lineUserId,
        displayName: users.displayName,
        pictureUrl: users.pictureUrl,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
      });

    const updated = updatedRows[0];
    if (!updated) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    const fullSession = await getIronSession<LineAppSession>(cookies(), getSessionOptions());
    fullSession.profileCompleted = true;
    await fullSession.save();

    return NextResponse.json({ ok: true, data: updated });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
