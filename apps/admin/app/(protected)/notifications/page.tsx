"use client";

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
    <main className="mx-auto max-w-lg">
      <h1 className="text-xl font-semibold">Manual LINE push</h1>
      <form onSubmit={send} className="mt-4 space-y-3">
        <label className="block text-sm">
          Member
          <select
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            required
          >
            <option value="">Select…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {(m.displayName ?? "Unknown") + ` (${m.id.slice(0, 8)}…)`}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Message
          <textarea
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={text}
            onChange={(e) => setText(e.target.value)}
            required
          />
        </label>
        <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white">
          Send
        </button>
      </form>
      {msg && <p className="mt-3 text-sm text-slate-700">{msg}</p>}
    </main>
  );
}
