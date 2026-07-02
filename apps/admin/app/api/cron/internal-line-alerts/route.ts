import { NextResponse } from "next/server";
import { processInternalLineAlerts } from "@/lib/internal-line-alerts/worker";

export const dynamic = "force-dynamic";

function assertCronAuthorized(request: Request): NextResponse | null {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    console.error("[internal-line-alerts] CRON_SECRET is not set");
    return NextResponse.json({ ok: false, error: "Not configured" }, { status: 503 });
  }

  const headerSecret = request.headers.get("x-cron-secret")?.trim() ?? "";
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (headerSecret !== expected && bearer !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

async function handleCron(request: Request) {
  const unauthorized = assertCronAuthorized(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await processInternalLineAlerts();
    return NextResponse.json({ ok: true, ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error";
    return NextResponse.json(
      { ok: false, error: msg, timestamp: new Date().toISOString() },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return handleCron(request);
}

export async function POST(request: Request) {
  return handleCron(request);
}
