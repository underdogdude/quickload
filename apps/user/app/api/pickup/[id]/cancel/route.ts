import { getDb, ishipPickupRequests } from "@quickload/shared/db";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { CacheHeaders } from "@/lib/api-cache";
import { cancelIshipCourier, IshipApiError } from "@/lib/iship";
import { toPickupRequestDto } from "@/lib/iship-pickup";
import { requireLineSession } from "@/lib/require-user";

const CANCELLABLE_STATUSES = ["requested", "assigned"];

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireLineSession();
    const { id } = await context.params;
    const db = getDb();
    const [pickup] = await db
      .select()
      .from(ishipPickupRequests)
      .where(and(eq(ishipPickupRequests.id, id), eq(ishipPickupRequests.userId, session.userId)))
      .limit(1);
    if (!pickup) {
      return NextResponse.json(
        { ok: false, error: "ไม่พบคำขอเข้ารับนี้" },
        { status: 404, headers: CacheHeaders.noStore },
      );
    }
    if (!CANCELLABLE_STATUSES.includes(pickup.status) || !pickup.ishipTicketPickupId) {
      return NextResponse.json(
        { ok: false, error: "สถานะปัจจุบันไม่สามารถยกเลิกการเข้ารับได้" },
        { status: 409, headers: CacheHeaders.noStore },
      );
    }

    const cancelled = await cancelIshipCourier(pickup.ishipTicketPickupId);
    const now = new Date();
    const [updated] = await db
      .update(ishipPickupRequests)
      .set({
        status: "cancelled",
        providerMessage: cancelled.message,
        ishipCancelResponseJson: cancelled.raw,
        cancelledAt: now,
        cancelledBy: session.userId,
        closedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(ishipPickupRequests.id, pickup.id),
          eq(ishipPickupRequests.userId, session.userId),
          inArray(ishipPickupRequests.status, CANCELLABLE_STATUSES),
        ),
      )
      .returning();
    if (!updated) {
      return NextResponse.json(
        { ok: false, error: "สถานะคำขอเปลี่ยนแปลงแล้ว กรุณาโหลดรายการใหม่" },
        { status: 409, headers: CacheHeaders.noStore },
      );
    }
    return NextResponse.json(
      { ok: true, data: toPickupRequestDto(updated) },
      { headers: CacheHeaders.noStore },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof IshipApiError) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: error.httpStatus, headers: CacheHeaders.noStore },
      );
    }
    const message = error instanceof Error ? error.message : "ยกเลิกการเข้ารับไม่สำเร็จ";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: CacheHeaders.noStore },
    );
  }
}
