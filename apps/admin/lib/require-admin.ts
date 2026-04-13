import type { User } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";

export async function requireAdminUser(): Promise<User> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401 });
  }
  return user;
}
