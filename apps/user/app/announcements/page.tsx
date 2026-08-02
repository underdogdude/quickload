"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

export default function AnnouncementsPage() {
  const router = useRouter();

  return (
    <main className="announcements-surface flex min-h-[100dvh] flex-col bg-white">
      <header className="bg-[#0802b8] pt-[env(safe-area-inset-top)] text-white">
        <div className="mx-auto flex h-16 w-full max-w-lg items-center justify-between gap-3 px-6">
          <h1 className="min-w-0 flex-1 text-left text-lg font-medium">ประกาศจากระบบ</h1>
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="ปิดประกาศจากระบบ"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-end rounded-lg transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 active:bg-white/15"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden>
              <path d="m5 5 14 14M19 5 5 19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>

      <section className="flex flex-1 items-center justify-center px-6 pb-[env(safe-area-inset-bottom)]">
        <div className="flex -translate-y-4 flex-col items-center text-center">
          <Image
            src="/notfound.png"
            alt=""
            width={240}
            height={217}
            priority
            className="h-auto w-56 object-contain opacity-75"
          />
          <p className="mt-8 text-lg font-light text-[#A8A8A8]">ไม่มีประกาศจากระบบ</p>
        </div>
      </section>
    </main>
  );
}
