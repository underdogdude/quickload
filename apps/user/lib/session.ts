import type { SessionOptions } from "iron-session";

export interface LineAppSession {
  lineUserId?: string;
  userId?: string;
  displayName?: string;
  pictureUrl?: string | null;
}

export function getSessionOptions(): SessionOptions {
  const password = process.env.IRON_SESSION_PASSWORD;
  if (!password || password.length < 32) {
    throw new Error("IRON_SESSION_PASSWORD must be set and at least 32 characters");
  }
  return {
    password,
    cookieName: "quickload_line_session",
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    },
  };
}
