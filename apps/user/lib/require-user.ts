import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import type { LineAppSession } from "./session";
import { getSessionOptions } from "./session";

export async function requireLineSession(): Promise<LineAppSession & { userId: string; lineUserId: string }> {
  const session = await getIronSession<LineAppSession>(cookies(), getSessionOptions());
  if (!session.userId || !session.lineUserId) {
    throw new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401 });
  }
  return session as LineAppSession & { userId: string; lineUserId: string };
}
