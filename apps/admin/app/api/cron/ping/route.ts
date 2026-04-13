import { getAdminSupabaseAdmin } from "@quickload/shared/client";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = getAdminSupabaseAdmin();
    const { error } = await supabase.from("users").select("id").limit(1);
    return NextResponse.json({ ok: !error, timestamp: new Date().toISOString(), error: error?.message });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, timestamp: new Date().toISOString(), error: msg }, { status: 500 });
  }
}
