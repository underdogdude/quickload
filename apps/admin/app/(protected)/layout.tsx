import { ensureAdminProfile } from "@/lib/ensure-admin";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await ensureAdminProfile(user);

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <nav className="flex flex-wrap items-center gap-3 text-sm">
            <Link className="font-semibold text-emerald-800 hover:text-emerald-900" href="/dashboard">
              Quickload
            </Link>
            <span className="text-slate-300" aria-hidden>
              |
            </span>
            <Link className="text-slate-700 hover:text-slate-900" href="/dashboard">
              Dashboard
            </Link>
            <Link className="text-slate-700 hover:text-slate-900" href="/parcels">
              Parcels
            </Link>
            <Link className="text-slate-700 hover:text-slate-900" href="/pickups">
              Pickups
            </Link>
            <Link className="text-slate-700 hover:text-slate-900" href="/pickups/slots">
              Slots
            </Link>
            <Link className="text-slate-700 hover:text-slate-900" href="/members">
              Members
            </Link>
            <Link className="text-slate-700 hover:text-slate-900" href="/notifications">
              Notifications
            </Link>
          </nav>
          <form action="/api/auth/signout" method="post">
            <button className="text-sm text-slate-600 hover:text-slate-900" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>
    </div>
  );
}
