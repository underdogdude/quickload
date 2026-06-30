import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { LineAppSession } from "@/lib/session";
import { getSessionOptions } from "@/lib/session";

/** Dev/E2E only — seeds iron-session so Playwright can hit logged-in layouts. */
export async function POST() {
  if (process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_DEV_SKIP_LINE_AUTH !== "true") {
    return NextResponse.json({ ok: false, error: "Not available" }, { status: 404 });
  }

  const session = await getIronSession<LineAppSession>(cookies(), getSessionOptions());
  session.lineUserId = "e2e-line-user";
  session.userId = "e2e-user-id";
  session.displayName = "E2E Test User";
  session.pictureUrl = null;
  session.profileCompleted = true;
  await session.save();

  return NextResponse.json({ ok: true });
}
