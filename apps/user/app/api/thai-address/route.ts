import { NextResponse } from "next/server";
import { searchThaiAddresses } from "@/lib/thai-address-search";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const limitRaw = searchParams.get("limit");
  const limit = Math.min(Math.max(Number(limitRaw) || 25, 1), 50);
  const data = searchThaiAddresses(q, limit);
  return NextResponse.json({ ok: true, data });
}
