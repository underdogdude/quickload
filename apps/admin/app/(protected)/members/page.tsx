"use client";

import { PageHeader } from "@/app/admin-ui";
import Image from "next/image";
import { useEffect, useState } from "react";

type Row = {
  id: string;
  lineUserId: string;
  displayName: string | null;
  pictureUrl: string | null;
  phone: string | null;
};

function memberInitials(member: Row) {
  const name = member.displayName?.trim();
  if (!name) return "?";
  return Array.from(name).slice(0, 2).join("").toUpperCase();
}

function MemberAvatar({ member }: { member: Row }) {
  if (member.pictureUrl) {
    return (
      <Image
        src={member.pictureUrl}
        alt=""
        width={40}
        height={40}
        className="h-10 w-10 rounded-full border border-slate-200 bg-slate-100 object-cover"
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-600">
      {memberInitials(member)}
    </div>
  );
}

export default function MembersPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/members");
      const json = (await res.json()) as { ok?: boolean; data?: Row[]; error?: string };
      if (cancelled) return;
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Failed");
        return;
      }
      setItems(json.data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="Members" description="LINE member records available for support lookup and manual notification workflows." />
      {error && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3 text-sm text-slate-600">
          Showing <span className="font-medium text-slate-950">{items.length}</span> members
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">LINE user id</th>
                <th className="px-4 py-3">User id</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex min-w-48 items-center gap-3">
                      <MemberAvatar member={m} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-950">{m.displayName ?? "Unknown"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{m.phone ?? "-"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{m.lineUserId}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{m.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {items.length === 0 ? <div className="border-t border-slate-100 px-4 py-10 text-center text-sm text-slate-600">No LINE members found.</div> : null}
      </div>
    </div>
  );
}
