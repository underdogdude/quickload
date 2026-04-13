import { getDb, pickupRequests, pickupSlots } from "@quickload/shared/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireLineSession } from "@/lib/require-user";

export async function POST(request: Request) {
  try {
    const session = await requireLineSession();
    const body = (await request.json()) as {
      slotId: string;
      address: string;
      note?: string;
      parcelIds?: string[];
    };
    if (!body.slotId || !body.address?.trim()) {
      return NextResponse.json({ ok: false, error: "slotId and address required" }, { status: 400 });
    }

    const db = getDb();
    const result = await db.transaction(async (tx) => {
      const slotRows = await tx
        .select()
        .from(pickupSlots)
        .where(eq(pickupSlots.id, body.slotId))
        .for("update")
        .limit(1);
      const slot = slotRows[0];
      if (!slot) {
        throw new Error("Slot not found");
      }
      if (!slot.isActive) {
        throw new Error("Slot inactive");
      }
      if (slot.bookedCount >= slot.maxCapacity) {
        throw new Error("Slot full");
      }

      await tx
        .update(pickupSlots)
        .set({ bookedCount: slot.bookedCount + 1 })
        .where(eq(pickupSlots.id, body.slotId));

      const inserted = await tx
        .insert(pickupRequests)
        .values({
          userId: session.userId,
          slotId: body.slotId,
          address: body.address.trim(),
          note: body.note?.trim() ?? null,
          parcelIds: body.parcelIds ?? null,
        })
        .returning();
      return inserted[0]!;
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg.includes("not found") ? 404 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
