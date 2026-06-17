import { NextResponse } from "next/server";
import { loadOutstandingItemsForUser } from "@/lib/load-outstanding-items";
import { requireLineSession } from "@/lib/require-user";

export async function GET() {
  try {
    const session = await requireLineSession();
    const { items, totalOutstanding, updatedAt } = await loadOutstandingItemsForUser(session.userId);

    return NextResponse.json({
      ok: true,
      data: {
        totalOutstanding,
        itemCount: items.length,
        updatedAt,
        items,
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
