import { cache } from "react";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { eq } from "drizzle-orm";
import { getDb, users } from "@quickload/shared/db";
import type { LineAppSession } from "./session";
import { getSessionOptions } from "./session";

export type CurrentUserSnapshot = {
  loggedIn: boolean;
  lineUserId: string | null;
  userId: string | null;
  displayName: string | null;
  pictureUrl: string | null;
  firstName: string | null;
  lastName: string | null;
  profileCompleted: boolean;
};

/**
 * Fetch session + user profile once per request.
 * `cache()` deduplicates across layout + page + nested server components,
 * so we only ever pay one session decrypt + one SELECT per navigation.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUserSnapshot> => {
  const session = await getIronSession<LineAppSession>(cookies(), getSessionOptions());

  if (!session.lineUserId) {
    return {
      loggedIn: false,
      lineUserId: null,
      userId: null,
      displayName: null,
      pictureUrl: null,
      firstName: null,
      lastName: null,
      profileCompleted: false,
    };
  }

  let displayName = session.displayName ?? null;
  let pictureUrl = session.pictureUrl ?? null;
  let firstName: string | null = null;
  let lastName: string | null = null;

  if (session.userId) {
    try {
      const db = getDb();
      const rows = await db
        .select({
          displayName: users.displayName,
          pictureUrl: users.pictureUrl,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(users)
        .where(eq(users.id, session.userId))
        .limit(1);
      const row = rows[0];
      if (row) {
        displayName = displayName ?? row.displayName;
        pictureUrl = pictureUrl ?? row.pictureUrl;
        firstName = row.firstName ?? null;
        lastName = row.lastName ?? null;
      }
    } catch {
      /* Don't fail the shell render if the DB is momentarily unreachable. */
    }
  }

  return {
    loggedIn: true,
    lineUserId: session.lineUserId,
    userId: session.userId ?? null,
    displayName,
    pictureUrl,
    firstName,
    lastName,
    profileCompleted: Boolean(session.profileCompleted),
  };
});
