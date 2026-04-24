import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
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
  const user = await getCurrentUser();
  const firstName = user.firstName?.trim() ?? "";
  const lastName = user.lastName?.trim() ?? "";
  const helloName = `${firstName} ${lastName}`.trim() || user.displayName || "Quickload user";

  return (
    <main className="min-h-full bg-slate-100">
      <section className="bg-[#2726F5] px-6 pb-20 pt-8 text-white">
        <div className="mx-auto w-full max-w-lg">
          <p className={`${TITLE_FONT_CLASS} text-3xl font-bold leading-tight`}>Hello, {helloName}</p>
          <p className="mt-0 text-base text-white/80">เลือกบริการด้านล่าง</p>
          <form className="mt-4" action="/parcels" method="get">
            <label className="sr-only" htmlFor="tracking-search">
              ค้นหาพัสดุ
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
                name="q"
                placeholder="ค้นหาเลขพัสดุ หรือ บาร์โค้ด"
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
            prefetch
            className="flex items-center justify-between rounded-lg bg-white px-5 py-5 shadow-sm ring-1 ring-slate-200 transition hover:border-[#2726F5]"
          >
            <div>
              <h3 className="text-xl font-medium">ส่งพัสดุ</h3>
              <p className="mt-1 text-xs text-slate-500">เริ่มลงทะเบียนพัสดุใหม่</p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- avoid next/image optimizer to keep ngrok stable */}
            <img
              src="/truck.png"
              alt="ส่งพัสดุ"
              width={120}
              height={120}
              loading="eager"
              // @ts-expect-error -- `fetchpriority` is valid HTML but missing from React types <19.
              fetchpriority="high"
              className="object-contain"
            />
          </Link>

          <div className="grid grid-cols-2 gap-4">
            {firstRowMenus.map((menu) => (
              <Link
                key={menu.href}
                href={menu.href}
                prefetch
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
                prefetch
                className="rounded-lg bg-white px-2 py-3 text-center shadow-sm ring-1 ring-slate-200 transition hover:border-[#2726F5] hover:bg-[#2726F5]/5"
              >
                <img src={menu.iconSrc} alt="" className="mx-auto h-10 w-10 object-contain" aria-hidden />
                <p className="mt-2 text-[15px] font-medium text-slate-700">{menu.label}</p>
              </Link>
            ))}
          </div>
        </div>
        <section className="mt-8 mx-auto rounded-lg bg-gradient-to-r from-[#2726F5] to-[#5655ff] text-white shadow-sm max-w-lg">
          <BannerCarousel />
        </section>
      </section>
    </main>
  );
}
