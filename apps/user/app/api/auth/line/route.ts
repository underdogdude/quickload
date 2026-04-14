import { getDb, users } from "@quickload/shared/db";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { LineAppSession } from "@/lib/session";
import { getSessionOptions } from "@/lib/session";

async function verifyLineAccessToken(accessToken: string): Promise<{
  sub: string;
  name?: string;
  picture?: string;
} | null> {
  // LIFF access token should be validated by calling LINE profile API.
  // oauth2/v2.1/verify does not return user id (sub), so we use profile as source of truth.
  const profileRes = await fetch("https://api.line.me/v2/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profileRes.ok) return null;

  const prof = (await profileRes.json()) as { userId?: string; displayName?: string; pictureUrl?: string };
  if (!prof.userId) return null;

  return { sub: prof.userId, name: prof.displayName, picture: prof.pictureUrl };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { accessToken?: string };
    if (!body.accessToken) {
      return NextResponse.json({ ok: false, error: "accessToken required" }, { status: 400 });
    }
    const profile = await verifyLineAccessToken(body.accessToken);
    if (!profile) {
      return NextResponse.json({ ok: false, error: "Invalid LINE token" }, { status: 401 });
    }

    const db = getDb();
    const upserted = await db
      .insert(users)
      .values({
        lineUserId: profile.sub,
        displayName: profile.name ?? null,
        pictureUrl: profile.picture ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: users.lineUserId,
        set: {
          displayName: profile.name ?? null,
          pictureUrl: profile.picture ?? null,
          updatedAt: new Date(),
        },
      })
      .returning({
        id: users.id,
        lineUserId: users.lineUserId,
        displayName: users.displayName,
        pictureUrl: users.pictureUrl,
      });
    const user = upserted[0];
    if (!user) {
      return NextResponse.json({ ok: false, error: "Failed to save user profile" }, { status: 500 });
    }

    const session = await getIronSession<LineAppSession>(cookies(), getSessionOptions());
    session.lineUserId = user.lineUserId;
    session.userId = user.id;
    session.displayName = user.displayName ?? undefined;
    session.pictureUrl = user.pictureUrl;
    await session.save();

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
