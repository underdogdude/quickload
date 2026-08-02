import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { formatShortQuickloadId } from "@/lib/profile-dashboard";
import { ProfileBannerCarousel } from "./profile-banner-carousel";
import { ProfileStatsPanel } from "./profile-stats";

const CUSTOMER_SERVICE_LINE_URL = "https://lin.ee/6c3gPxZ";

const MENU_ITEMS = [
  {
    href: "/profile/edit",
    label: "ข้อมูลส่วนตัว",
    description: "แก้ไขชื่อ เบอร์โทร และข้อมูลสมาชิก",
    icon: "person",
  },
  {
    href: "/parcels",
    label: "พัสดุของฉัน",
    description: "ติดตามรายการและสถานะการจัดส่ง",
    icon: "parcel",
  },
  {
    href: "/addresses",
    label: "สมุดที่อยู่ของฉัน",
    description: "จัดการที่อยู่ผู้ส่งและผู้รับ",
    icon: "address",
  },
  {
    href: "/payment",
    label: "ข้อมูลการเรียกเก็บเงินของฉัน",
    description: "ยอดคงค้างและประวัติการชำระเงิน",
    icon: "receipt",
  },
] as const;

function QuickloadMemberMedallion() {
  return (
    <div className="relative shrink-0 pb-3" aria-label="Quickload Member">
      <Image
        src="/q-badge.png"
        alt="ตราสมาชิก Quickload"
        width={78}
        height={78}
        priority
        className="h-[78px] w-[78px] object-contain drop-shadow-[0_6px_6px_rgba(0,0,0,0.24)]"
      />
      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full bg-[#0802b8] px-3 py-[2px] text-[10px] font-normal text-white border border-white shadow-sm ring-1 ring-[#0802b8]/10">
        Member
      </span>
    </div>
  );
}

function MenuIcon({ name }: { name: (typeof MENU_ITEMS)[number]["icon"] }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (name === "person") {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
        <circle cx="12" cy="8" r="3.5" {...common} />
        <path d="M5 20c0-3.8 3-6 7-6s7 2.2 7 6" {...common} />
      </svg>
    );
  }
  if (name === "parcel") {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
        <path d="m4 7 8-4 8 4-8 4-8-4Z" {...common} />
        <path d="M4 7v10l8 4 8-4V7M12 11v10" {...common} />
      </svg>
    );
  }
  if (name === "address") {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
        <rect x="4" y="3" width="16" height="18" rx="3" {...common} />
        <circle cx="12" cy="9" r="2.5" {...common} />
        <path d="M8 17c.7-2.1 2.1-3.2 4-3.2s3.3 1.1 4 3.2M2 7h2M2 12h2M2 17h2" {...common} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
      <path d="M5 3h14v18l-2.5-1.7L14 21l-2-1.7L10 21l-2.5-1.7L5 21V3Z" {...common} />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h4" {...common} />
    </svg>
  );
}

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user.loggedIn || !user.userId) {
    redirect("/entry");
  }
  if (!user.profileCompleted) {
    redirect("/register");
  }

  const fullName =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.displayName?.trim() ||
    "สมาชิก Quickload";
  const memberId = formatShortQuickloadId(user.userId);

  return (
    <main className="profile-surface min-h-screen bg-slate-100 pb-8">
      <section className="bg-[#0802b8] px-6 pb-20 pt-[calc(env(safe-area-inset-top)+32px)] text-white">
        <div className="mx-auto flex w-full max-w-lg items-center gap-4">
          <QuickloadMemberMedallion />

          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium">บัญชี QUICKLOAD</p>
            <h1 className="mt-0.5 line-clamp-2 text-xl font-semibold leading-tight sm:text-2xl">
              {fullName}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-white/80">
              <span>{user.phone || "ยังไม่ได้ระบุเบอร์โทร"}</span>
              <span className="text-white/35" aria-hidden>
                •
              </span>
              <span className="tracking-[0.04em]">ID: {memberId}</span>
            </div>
          </div>

          <a
            href={CUSTOMER_SERVICE_LINE_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="แชตกับ Quickload ทาง LINE"
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-[#0802b8] shadow-[0_4px_8px_rgba(0,0,0,0.16)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00B7FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0802b8] active:translate-y-0 motion-reduce:transition-none"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden>
              <path
                d="M20 11.5c0 4.1-3.8 7.5-8.5 7.5-1.1 0-2.2-.2-3.2-.5L4 20l1.2-3.5A7.1 7.1 0 0 1 3 11.5C3 7.4 6.8 4 11.5 4S20 7.4 20 11.5Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path d="M7.5 10h8M7.5 13h5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </a>
        </div>
      </section>

      <section className="-mt-12 px-6">
        <div className="mx-auto w-full max-w-lg">
          <ProfileStatsPanel />
        </div>
      </section>

      <section className="mt-5 px-6" aria-label="เมนูโปรไฟล์">
        <div className="mx-auto w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-[0_4px_8px_rgba(15,23,42,0.07)]">
          {MENU_ITEMS.map((item, index) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              className={`group flex min-h-[76px] items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0802b8] ${
                index > 0 ? "border-t border-slate-100" : ""
              }`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0802b8]/[0.08] text-[#0802b8]">
                <MenuIcon name={item.icon} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium text-slate-950">{item.label}</span>
                <span className="mt-0.5 block truncate text-xs text-slate-500">{item.description}</span>
              </span>
              <span
                className="text-2xl font-light text-slate-400 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                aria-hidden
              >
                ›
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8 mb-4" aria-label="บริการแนะนำ">
        <ProfileBannerCarousel />
      </section>

      <p className="mt-1 px-6 text-center text-xs text-slate-500">
        หาสิ่งที่คุณต้องการไม่เจอ?{" "}
        <a
          href={CUSTOMER_SERVICE_LINE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center font-medium text-[#0802b8] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0802b8]"
        >
          ส่งข้อเสนอแนะ
        </a>
      </p>
    </main>
  );
}
