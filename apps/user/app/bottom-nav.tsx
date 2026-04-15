"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "หน้าแรก", icon: "home" },
  { href: "/parcels", label: "พัสดุ", icon: "box" },
  { href: "/send", label: "ส่งพัสดุ", center: true },
  { href: "/tracking", label: "ติดตาม", icon: "pin" },
  { href: "/help", label: "โปรไฟล์", icon: "user" },
];

function Icon({ name, active }: { name: "home" | "box" | "pin" | "user"; active: boolean }) {
  const color = active ? "#FFFFFF" : "#A8A8B3";
  const cls = "h-[18px] w-[18px]";
  if (name === "home") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={cls} aria-hidden>
        <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" stroke={color} strokeWidth="1.9" />
      </svg>
    );
  }
  if (name === "box") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={cls} aria-hidden>
        <path d="M4 8.5 12 4l8 4.5-8 4L4 8.5Z" stroke={color} strokeWidth="1.9" />
        <path d="M4 8.5V17l8 4 8-4V8.5" stroke={color} strokeWidth="1.9" />
        <path d="M12 12.5V21" stroke={color} strokeWidth="1.9" />
      </svg>
    );
  }
  if (name === "pin") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={cls} aria-hidden>
        <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" stroke={color} strokeWidth="1.9" />
        <circle cx="12" cy="10" r="2.4" stroke={color} strokeWidth="1.9" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cls} aria-hidden>
      <circle cx="12" cy="8" r="4" stroke={color} strokeWidth="1.9" />
      <path d="M4 20c0-3.8 3.6-6 8-6s8 2.2 8 6" stroke={color} strokeWidth="1.9" />
    </svg>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  if (pathname.startsWith("/send")) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 px-5 pb-[calc(env(safe-area-inset-bottom)+40px)] pt-2 bg-slate-100">
      <div className="mx-auto grid w-full max-w-lg grid-cols-5 items-end gap-1 rounded-[28px] bg-[#121316] px-2 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
        {items.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          if (item.center) {
            return (
              <Link key={item.href} href={item.href} className="flex flex-col items-center -mt-7">
                <span className="inline-flex h-[62px] w-[62px] items-center justify-center rounded-full bg-gradient-to-br from-[#2726F5] to-[#00B7FF] p-[3px] shadow-lg">
                  <span className={`inline-flex h-full w-full items-center justify-center rounded-full text-4xl leading-none text-[#1f2024] bg-white`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" className="bi bi-plus-lg" viewBox="0 0 16 16">
                      <path fillRule="evenodd" d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2" />
                    </svg>
                  </span>
                </span>
              </Link>
            );
          }

          return (
            <Link key={item.href} href={item.href} className="flex flex-col items-center gap-0.5 pb-1 pt-1">
              <Icon name={item.icon as "home" | "box" | "pin" | "user"} active={active} />
              <span className={`text-[10px] ${active ? "font-semibold text-white" : "text-[#9EA3AF]"}`}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
