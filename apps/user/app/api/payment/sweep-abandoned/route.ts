import { NextResponse } from "next/server";

/** Abandonment sweep disabled — no auto-cancel for unpaid parcels. */
export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("[sweep-abandoned] CRON_SECRET is not set");
    return NextResponse.json({ ok: false, error: "Not configured" }, { status: 503 });
  }
  const presented = request.headers.get("x-cron-secret")?.trim() ?? "";
  if (presented !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    sweptAt: new Date().toISOString(),
    canceled: [],
  });
}
