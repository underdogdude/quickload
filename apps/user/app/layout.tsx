import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { GoogleAnalytics } from "@/lib/google-analytics";
import { getCurrentUser } from "@/lib/current-user";
import { BottomNav, BottomNavSpacer } from "./bottom-nav";
import { LoggedInShell } from "./logged-in-shell";
import { NavigationFeedback } from "./navigation-feedback";
import { RoutePrefetcher } from "./route-prefetcher";
import { UserHeader } from "./user-header";

export const metadata: Metadata = {
  title: "Quickload",
  description: "Quickload — parcel services on LINE",
  applicationName: "Quickload",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#2726F5",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://profile.line-scdn.net" crossOrigin="" />
        <link rel="dns-prefetch" href="https://profile.line-scdn.net" />
      </head>
      <body className="min-h-screen bg-slate-50">
        <NavigationFeedback />
        {user.loggedIn ? (
          <LoggedInShell>
            <UserHeader displayName={user.displayName} pictureUrl={user.pictureUrl} />
            <div>
              {children}
              <BottomNavSpacer />
            </div>
            <BottomNav />
            <RoutePrefetcher />
          </LoggedInShell>
        ) : (
          <div>{children}</div>
        )}
        <GoogleAnalytics />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
