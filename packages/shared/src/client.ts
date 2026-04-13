import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function createSupabaseBrowser(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey);
}

export function createSupabaseAdmin(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** User app server: uses project URL + service role (API routes only). */
export function getUserAppSupabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  return createSupabaseAdmin(url, key);
}

/** Admin app: NEXT_PUBLIC URLs + service role for server cron / privileged ops. */
export function getAdminSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return createSupabaseAdmin(url, key);
}
