import Link from "next/link";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb, users } from "@quickload/shared/db";
import type { LineAppSession } from "@/lib/session";
import { getSessionOptions } from "@/lib/session";
import { BannerCarousel } from "./banner-carousel";

const quickMenus = [
  { href: "/parcels", label: "พัสดุของฉัน", iconSrc: "/parcel.png" },
  { href: "/payment", label: "ยอดชำระ", iconSrc: "/bill.png" },
  { href: "/addresses", label: "สมุดที่อยู่", iconSrc: "/address.png" },
  { href: "/manual", label: "คู่มือการใช้งาน", iconSrc: "/manual.png" },
  { href: "/help", label: "ช่วยเหลือ", iconSrc: "/faq.png" },
];
const firstRowMenus = quickMenus.slice(0, 2);
const secondRowMenus = quickMenus.slice(2);

const TITLE_FONT_CLASS = "font-title-placeholder";

export default async function HomePage() {
  const session = await getIronSession<LineAppSession>(cookies(), getSessionOptions());

  let firstName = "";
  let lastName = "";
  if (session.userId) {
    const db = getDb();
    const rows = await db
      .select({
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);
    const row = rows[0];
    firstName = row?.firstName?.trim() ?? "";
    lastName = row?.lastName?.trim() ?? "";
  }
  const helloName = `${firstName} ${lastName}`.trim() || session.displayName || "Quickload user";

  return (
    <main className="min-h-full bg-slate-100">
      <section className="bg-[#2726F5] px-6 pb-20 pt-8 text-white">
        <div className="mx-auto w-full max-w-lg">
          <p className={`${TITLE_FONT_CLASS} text-3xl font-bold leading-tight`}>Hello, {helloName}</p>
          <p className="mt-0 text-base text-white/80">เลือกบริการด้านล่าง</p>
          <form className="mt-4" action="/tracking" method="get">
            <label className="sr-only" htmlFor="tracking-search">
              ค้นหารหัสพัสดุ
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400" aria-hidden>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-4 w-4"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
              </span>
              <input
                id="tracking-search"
                type="text"
                name="trackingId"
                placeholder="ค้นหาพัสดุ หรือ ติดตามพัสดุ"
                required
                className="w-full rounded-lg border border-white/25 bg-white py-3 pl-10 pr-4 text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
            </div>
          </form>
        </div>
      </section>

      <section className="-mt-12 px-6 pb-10">
        <div className="mx-auto w-full max-w-lg space-y-5">
          <Link
            href="/send"
            className="flex items-center justify-between rounded-lg bg-white px-5 py-5 shadow-sm ring-1 ring-slate-200 transition hover:border-[#2726F5]"
          >
            <div>
              <h3 className="text-xl font-medium">ส่งพัสดุ</h3>
              <p className="mt-1 text-xs text-slate-500">เริ่มลงทะเบียนพัสดุใหม่</p>
            </div>
            <img src="/truck.png" alt="ส่งพัสดุ" width={120} height={120} className="object-contain" />
          </Link>

          <div className="grid grid-cols-2 gap-4">
            {firstRowMenus.map((menu) => (
              <Link
                key={menu.href}
                href={menu.href}
                className="rounded-lg bg-white px-2 py-3 text-center shadow-sm ring-1 ring-slate-200 transition hover:border-[#2726F5] hover:bg-[#2726F5]/5"
              >
                <img src={menu.iconSrc} alt="" className="mx-auto h-12 w-12 object-contain" aria-hidden />
                <p className="mt-2 text-[16px] font-medium text-slate-700">{menu.label}</p>
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-4">
            {secondRowMenus.map((menu) => (
              <Link
                key={menu.href}
                href={menu.href}
                className="rounded-lg bg-white px-2 py-3 text-center shadow-sm ring-1 ring-slate-200 transition hover:border-[#2726F5] hover:bg-[#2726F5]/5"
              >
                <img src={menu.iconSrc} alt="" className="mx-auto h-10 w-10 object-contain" aria-hidden />
                <p className="mt-2 text-[15px] font-medium text-slate-700">{menu.label}</p>
              </Link>
            ))}
          </div>
        </div>
        <section className="mt-8 rounded-lg bg-gradient-to-r from-[#2726F5] to-[#5655ff] text-white shadow-sm">
          <BannerCarousel />
        </section>
      </section>
    </main>
  );
}
