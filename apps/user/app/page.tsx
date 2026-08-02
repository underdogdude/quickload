import Image from "next/image";
import Link from "next/link";
import { AppFooter } from "@/components/app-footer";
import { getCurrentUser } from "@/lib/current-user";
import { BannerCarousel } from "./banner-carousel";
import { HomeOngoingActivity } from "./home-ongoing-activity";
import { SendParcelPromoCard } from "./send-parcel-promo-card";
import { UserHeader } from "./user-header";

const quickMenus = [
  { href: "/parcels", label: "พัสดุของฉัน", iconSrc: "/my-parcel.png" },
  { href: "/payment", label: "ยอดชำระ", iconSrc: "/bill.png" },
  { href: "/price-check", label: "เช็คราคา", iconSrc: "/price-check.png" },
  { href: "/addresses", label: "สมุดที่อยู่", iconSrc: "/address.png" },
  { href: "/manual", label: "คู่มือการใช้งาน", iconSrc: "/manual.png" },
];
const firstRowMenus = quickMenus.slice(0, 2);
const secondRowMenus = quickMenus.slice(2);

const TITLE_FONT_CLASS = "font-title-placeholder";

export default async function HomePage() {
  const user = await getCurrentUser();
  const helloName = user.firstName?.trim() || user.displayName || "Quickload user";

  return (
    <>
      {user.loggedIn ? <UserHeader pictureUrl={user.pictureUrl} /> : null}

      <main className="min-h-full bg-slate-100">
        <section
          className={`px-6 text-white ${
            user.loggedIn
              ? "-mt-[84px] bg-[url('/quickload-banner.png')] bg-cover bg-center bg-no-repeat pb-12 pt-[92px]"
              : "bg-[#0802b8] pb-20 pt-8"
          }`}
        >
          <div className="mx-auto w-full max-w-lg">
            {user.loggedIn ? (
              <h1>
                <Image
                  src="/text-vector.png"
                  alt="ส่งง่าย ไวทันใจ กับ Quickload"
                  width={941}
                  height={362}
                  priority
                  className="h-auto w-[48vw] max-w-40 object-contain"
                />
              </h1>
            ) : (
              <>
                <p className={`${TITLE_FONT_CLASS} text-3xl font-bold leading-tight`}>สวัสดีคุณ {helloName}</p>
                <p className="mt-0 text-base text-white/80">เลือกบริการด้านล่าง</p>
                <form className="mt-4" action="/parcels" method="get">
                  <label className="sr-only" htmlFor="tracking-search">
                    ค้นหาพัสดุ
                  </label>
                  <div className="relative">
                    <span
                      className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400"
                      aria-hidden
                    >
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
              </>
            )}
          </div>
        </section>

        <section className="-mt-6 px-6 pb-10">
          <div className="mx-auto w-full max-w-lg space-y-3">
            <SendParcelPromoCard />

            <div className="grid grid-cols-2 gap-3">
              {firstRowMenus.map((menu) => (
                <Link
                  key={menu.href}
                  href={menu.href}
                  prefetch
                  className="rounded-lg bg-white px-2 py-3 text-center shadow-sm ring-1 ring-slate-200 transition hover:border-[#0802b8] hover:bg-[#0802b8]/5"
                >
                  <img src={menu.iconSrc} alt="" className="mx-auto h-12 w-12 object-contain" aria-hidden />
                  <p className="mt-2 text-[16px] font-medium text-slate-700">{menu.label}</p>
                </Link>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3">
              {secondRowMenus.map((menu) => (
                <Link
                  key={menu.href}
                  href={menu.href}
                  prefetch
                  className="rounded-lg bg-white px-2 py-3 text-center shadow-sm ring-1 ring-slate-200 transition hover:border-[#0802b8] hover:bg-[#0802b8]/5"
                >
                  <img
                    src={menu.iconSrc}
                    alt=""
                    className={`mx-auto object-contain ${menu.href === "/price-check" ? "h-12 w-12" : "h-10 w-10"}`}
                    aria-hidden
                  />
                  <p className="mt-2 text-[15px] font-medium text-slate-700">{menu.label}</p>
                </Link>
              ))}
            </div>
          </div>
          <HomeOngoingActivity userId={user.userId} />
          <section className="mx-auto mt-4 max-w-lg overflow-hidden rounded-lg bg-gradient-to-r from-[#0802b8] to-[#2e28d4] text-white shadow-sm">
            <BannerCarousel />
          </section>

          <AppFooter />
        </section>
      </main>
    </>
  );
}
