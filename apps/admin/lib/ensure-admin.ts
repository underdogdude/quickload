import { getDb } from "@quickload/shared/db";
import { adminUsers } from "@quickload/shared/db/schema";
import type { User } from "@supabase/supabase-js";

export async function ensureAdminProfile(user: User) {
  const db = getDb();
  const email = user.email ?? `${user.id}@users.invalid`;
  await db
    .insert(adminUsers)
    .values({
      id: user.id,
      email,
      fullName: (user.user_metadata?.full_name as string | undefined) ?? null,
    })
    .onConflictDoUpdate({
      target: adminUsers.id,
      set: { email, fullName: (user.user_metadata?.full_name as string | undefined) ?? null },
    });
}
