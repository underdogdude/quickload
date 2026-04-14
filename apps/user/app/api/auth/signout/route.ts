import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { LineAppSession } from "@/lib/session";
import { getSessionOptions } from "@/lib/session";

export async function POST(request: Request) {
  const session = await getIronSession<LineAppSession>(cookies(), getSessionOptions());
  await session.destroy();
  return NextResponse.redirect(new URL("/entry", request.url));
}
