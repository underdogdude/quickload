import { SEND_ACCESS_BLOCKED_MESSAGE } from "@quickload/shared/send-access-block";
import { NextResponse } from "next/server";
import { getSendAccessBlockForUser } from "@/lib/send-access-block";
import { requireLineSession } from "@/lib/require-user";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireLineSession();
    const { blocked, overdueParcelCount } = await getSendAccessBlockForUser(session.userId);

    return NextResponse.json({
      ok: true,
      data: {
        blocked,
        overdueParcelCount,
        message: blocked ? SEND_ACCESS_BLOCKED_MESSAGE : null,
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
