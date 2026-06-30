import { ensureAdminProfile } from "@/lib/ensure-admin";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/parcels", label: "Parcels" },
  { href: "/pickups/slots", label: "Pickup slots" },
  { href: "/members", label: "Members" },
  { href: "/notifications", label: "Notifications" },
];

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await ensureAdminProfile(user);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col lg:flex-row">
        <aside className="border-b border-slate-200 bg-slate-950 text-white lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:border-b-0 lg:border-r lg:border-slate-900">
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-3 px-5 py-5 lg:block">
              <Link href="/dashboard" className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-400 text-sm font-bold text-emerald-950">
                  QL
                </span>
                <span>
                  <span className="block text-sm font-semibold">Quickload</span>
                  <span className="block text-xs text-slate-400">Admin operations</span>
                </span>
              </Link>
              <form action="/api/auth/signout" method="post" className="lg:hidden">
                <button className="rounded-md border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 hover:border-slate-500 hover:text-white" type="submit">
                  Sign out
                </button>
              </form>
            </div>

            <nav className="flex gap-1 overflow-x-auto px-3 pb-4 text-sm lg:flex-col lg:overflow-visible lg:px-4 lg:pb-0">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="whitespace-nowrap rounded-md px-3 py-2 font-medium text-slate-300 transition hover:bg-slate-900 hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="mt-auto hidden border-t border-slate-900 px-5 py-5 lg:block">
              <p className="truncate text-xs text-slate-500">Signed in as</p>
              <p className="mt-1 truncate text-sm font-medium text-slate-200">{user.email ?? "Admin user"}</p>
              <form action="/api/auth/signout" method="post" className="mt-4">
                <button className="w-full rounded-md border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-white" type="submit">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
