import { getDb, users } from "@quickload/shared/db";
import { eq } from "drizzle-orm";
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
  const verifyRes = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!verifyRes.ok) return null;
  const verify = (await verifyRes.json()) as { sub?: string };
  if (!verify.sub) return null;

  let name: string | undefined;
  let picture: string | undefined;
  const profileRes = await fetch("https://api.line.me/v2/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (profileRes.ok) {
    const prof = (await profileRes.json()) as { displayName?: string; pictureUrl?: string };
    name = prof.displayName;
    picture = prof.pictureUrl;
  }

  return { sub: verify.sub, name, picture };
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
    const existingRows = await db
      .select()
      .from(users)
      .where(eq(users.lineUserId, profile.sub))
      .limit(1);
    const existing = existingRows[0];

    let userId: string;
    if (existing) {
      userId = existing.id;
      await db
        .update(users)
        .set({
          displayName: profile.name ?? existing.displayName,
          pictureUrl: profile.picture ?? existing.pictureUrl,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id));
    } else {
      const inserted = await db
        .insert(users)
        .values({
          lineUserId: profile.sub,
          displayName: profile.name ?? null,
          pictureUrl: profile.picture ?? null,
        })
        .returning({ id: users.id });
      userId = inserted[0]!.id;
    }

    const session = await getIronSession<LineAppSession>(cookies(), getSessionOptions());
    session.lineUserId = profile.sub;
    session.userId = userId;
    session.displayName = profile.name;
    session.pictureUrl = profile.picture ?? null;
    await session.save();

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
