import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, users } from "@quickload/shared/db";
import { verifyFlexToken } from "@/lib/flex-token";
import { resolvePublicBaseUrl } from "@/lib/public-base-url";
import type { LineAppSession } from "@/lib/session";
import { getSessionOptions } from "@/lib/session";

/**
 * Magic-link endpoint for LINE Flex message "ติดตามพัสดุ" buttons.
 *
 * Flow:
 *   1. Validate the signed flex token from ?token=
 *   2. Look up the user in the database
 *   3. Hydrate an iron-session cookie so subsequent page/API calls work
 *   4. Redirect to /parcels/{parcelId}
 *
 * This route is intentionally excluded from middleware auth checks because
 * it starts with /api — the middleware allows all /api/* requests through.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token")?.trim() ?? "";

    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });
    }

    const payload = verifyFlexToken(token);
    if (!payload || payload.action !== "track") {
      return NextResponse.json(
        { ok: false, error: "ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว" },
        { status: 403 },
      );
    }

    const db = getDb();
    const [user] = await db
      .select({
        id: users.id,
        lineUserId: users.lineUserId,
        displayName: users.displayName,
        pictureUrl: users.pictureUrl,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
      })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    const session = await getIronSession<LineAppSession>(cookies(), getSessionOptions());
    session.userId = user.id;
    session.lineUserId = user.lineUserId;
    session.displayName = user.displayName ?? undefined;
    session.pictureUrl = user.pictureUrl;
    session.profileCompleted = Boolean(
      user.firstName?.trim() && user.lastName?.trim() && user.phone?.trim(),
    );
    await session.save();

    const baseUrl = resolvePublicBaseUrl(request);
    if (!baseUrl) {
      return NextResponse.json(
        { ok: false, error: "ไม่สามารถสร้างลิงก์ได้ กรุณาติดต่อทีมงาน" },
        { status: 500 },
      );
    }

    const dest = new URL(`/parcels/${encodeURIComponent(payload.parcelId)}`, baseUrl);
    return NextResponse.redirect(dest.toString(), 302);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
