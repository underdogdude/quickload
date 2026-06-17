"use client";

import { SendAccessGuard } from "@/lib/send-access-ui";

export default function SendLayout({ children }: { children: React.ReactNode }) {
  return <SendAccessGuard>{children}</SendAccessGuard>;
}
