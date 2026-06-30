"use client";

import { PageHeader } from "@/app/admin-ui";
import { useEffect, useState } from "react";

type Member = { id: string; displayName: string | null };

export default function NotificationsPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [userId, setUserId] = useState("");
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/members");
      const json = (await res.json()) as { ok?: boolean; data?: Member[] };
      if (cancelled) return;
      if (res.ok && json.ok) setMembers(json.data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, text }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) {
      setMsg(json.error ?? "Failed");
      return;
    }
    setMsg("Sent");
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Manual LINE push" description="Send one-off support messages to registered LINE members. Use this for operational exceptions only." />
      <form onSubmit={send} className="max-w-2xl space-y-4 rounded-lg border border-slate-200 bg-white p-5">
        <label className="block text-sm font-medium text-slate-700">
          Member
          <select
            className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            required
          >
            <option value="">Select member</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {(m.displayName ?? "Unknown") + ` (${m.id.slice(0, 8)})`}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Message
          <textarea
            className="mt-1 min-h-32 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-950 placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a concise support message."
            required
          />
        </label>
        <button type="submit" className="h-10 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800">
          Send
        </button>
        {msg && (
          <p className={msg === "Sent" ? "text-sm font-medium text-emerald-700" : "text-sm font-medium text-rose-700"}>
            {msg}
          </p>
        )}
      </form>
    </div>
  );
}
