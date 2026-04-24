import { getIronSession } from "iron-session";
import { NextResponse, type NextRequest } from "next/server";
import type { LineAppSession } from "./lib/session";
import { getSessionOptions } from "./lib/session";

export async function middleware(request: NextRequest) {
  if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEV_SKIP_LINE_AUTH === "true") {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api") || pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const session = await getIronSession<LineAppSession>(request, response, getSessionOptions());

  if (pathname === "/entry") {
    if (session.lineUserId) {
      const url = request.nextUrl.clone();
      url.pathname = session.profileCompleted ? "/" : "/register";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (!session.lineUserId) {
    const url = request.nextUrl.clone();
    url.pathname = "/entry";
    return NextResponse.redirect(url);
  }
  if (!session.profileCompleted) {
    if (pathname === "/register") {
      return response;
    }
    const url = request.nextUrl.clone();
    url.pathname = "/register";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|ttf|otf|woff|woff2)$).*)",
  ],
};
