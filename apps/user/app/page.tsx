import Link from "next/link";

const menus = [
  { href: "/register", label: "Menu 1 — Register parcel" },
  { href: "/parcels", label: "Menu 2 — My parcels" },
  { href: "/tracking", label: "Menu 3 — Tracking" },
  { href: "/payment", label: "Menu 4 — Payment balance" },
  { href: "/help", label: "Menu 5 — Help" },
];

export default function HomePage() {
  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="text-xl font-semibold text-slate-900">Quickload</h1>
      <p className="mt-1 text-sm text-slate-600">เลือกบริการด้านล่าง</p>
      <ul className="mt-6 space-y-2">
        {menus.map((m) => (
          <li key={m.href}>
            <Link
              href={m.href}
              className="block rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-800 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50"
            >
              {m.label}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
