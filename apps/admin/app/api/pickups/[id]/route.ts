import { pushAndLogLineMessage } from "@quickload/shared/notifications";
import { pickupRequests, users } from "@quickload/shared/db/schema";
import { getDb } from "@quickload/shared/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/require-admin";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminUser();
    const { id } = await context.params;
    const body = (await request.json()) as { status?: "confirmed" | "cancelled" | "completed" };
    if (!body.status) {
      return NextResponse.json({ ok: false, error: "status required" }, { status: 400 });
    }

    const db = getDb();
    const rows = await db.select().from(pickupRequests).where(eq(pickupRequests.id, id)).limit(1);
    const reqRow = rows[0];
    if (!reqRow) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    await db
      .update(pickupRequests)
      .set({
        status: body.status,
        confirmedBy: body.status === "confirmed" ? admin.id : reqRow.confirmedBy,
        updatedAt: new Date(),
      })
      .where(eq(pickupRequests.id, id));

    const userRows = await db.select().from(users).where(eq(users.id, reqRow.userId)).limit(1);
    const u = userRows[0];
    if (u && body.status === "confirmed") {
      await pushAndLogLineMessage({
        userId: u.id,
        lineUserId: u.lineUserId,
        type: "pickup_confirmed",
        message: { type: "text", text: "Your pickup request has been confirmed." },
        payload: { pickupRequestId: id },
      });
    }

    const out = await db.select().from(pickupRequests).where(eq(pickupRequests.id, id)).limit(1);
    return NextResponse.json({ ok: true, data: out[0] });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
