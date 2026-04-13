import { pickupSlots } from "@quickload/shared/db/schema";
import { getDb } from "@quickload/shared/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/require-admin";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminUser();
    const { id } = await context.params;
    const body = (await request.json()) as Partial<{
      maxCapacity: number;
      isActive: boolean;
      timeWindow: string;
      date: string;
    }>;

    const patch: Partial<typeof pickupSlots.$inferInsert> = {};
    if (body.maxCapacity !== undefined) patch.maxCapacity = body.maxCapacity;
    if (body.isActive !== undefined) patch.isActive = body.isActive;
    if (body.timeWindow !== undefined) patch.timeWindow = body.timeWindow;
    if (body.date !== undefined) patch.date = body.date;
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: false, error: "No fields to update" }, { status: 400 });
    }

    const db = getDb();
    await db.update(pickupSlots).set(patch).where(eq(pickupSlots.id, id));

    const rows = await db.select().from(pickupSlots).where(eq(pickupSlots.id, id)).limit(1);
    return NextResponse.json({ ok: true, data: rows[0] });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
