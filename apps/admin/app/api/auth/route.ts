import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return NextResponse.json({ ok: true, authenticated: !!user, userId: user?.id ?? null });
}
