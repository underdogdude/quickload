"use client";

import { SendAccessProvider } from "@/lib/send-access-ui";

export function LoggedInShell({ children }: { children: React.ReactNode }) {
  return <SendAccessProvider>{children}</SendAccessProvider>;
}
