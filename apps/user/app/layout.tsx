import type { Metadata } from "next";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb, users } from "@quickload/shared/db";
import "./globals.css";
import { LiffProvider } from "./liff-provider";
import type { LineAppSession } from "@/lib/session";
import { getSessionOptions } from "@/lib/session";
import { UserHeader } from "./user-header";

export const metadata: Metadata = {
  title: "Quickload",
  description: "Quickload — parcel services on LINE",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getIronSession<LineAppSession>(cookies(), getSessionOptions());
  const loggedIn = Boolean(session.lineUserId);

  let displayName = session.displayName ?? null;
  let pictureUrl = session.pictureUrl ?? null;
  if (loggedIn && session.userId && (displayName == null || pictureUrl == null)) {
    const db = getDb();
    const rows = await db
      .select({ displayName: users.displayName, pictureUrl: users.pictureUrl })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);
    const row = rows[0];
    if (row) {
      displayName = displayName ?? row.displayName;
      pictureUrl = pictureUrl ?? row.pictureUrl;
    }
  }

  return (
    <html lang="th">
      <body className="min-h-screen bg-slate-50">
        <LiffProvider>
          {loggedIn ? <UserHeader displayName={displayName} pictureUrl={pictureUrl} /> : null}
          {children}
        </LiffProvider>
      </body>
    </html>
  );
}
