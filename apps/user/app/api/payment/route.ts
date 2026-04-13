import { getLegacyPaymentBalance } from "@quickload/shared/legacy";
import { NextResponse } from "next/server";
import { requireLineSession } from "@/lib/require-user";

export async function GET() {
  try {
    const session = await requireLineSession();
    const balance = await getLegacyPaymentBalance(session.userId);
    return NextResponse.json({ ok: true, data: { balance } });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
