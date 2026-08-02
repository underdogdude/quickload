import Link from "next/link";

type UserHeaderProps = {
  pictureUrl?: string | null;
};

export function UserHeader({ pictureUrl }: UserHeaderProps) {
  return (
    <header className="relative z-10 bg-transparent px-6 py-6 text-white">
      <div className="mx-auto flex w-full max-w-lg items-center gap-4">
        {pictureUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- LINE CDN; avoids remotePatterns setup
          <img
            src={pictureUrl}
            alt="รูปโปรไฟล์ LINE"
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-white/40"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-white ring-1 ring-white/30"
            aria-label="รูปโปรไฟล์ LINE"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
              <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
              <path d="M5.5 20c0-3.5 2.9-5.8 6.5-5.8s6.5 2.3 6.5 5.8" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </div>
        )}

        <form className="min-w-0 flex-1" action="/parcels" method="get">
          <label className="sr-only" htmlFor="header-tracking-search">
            ค้นหาเลขพัสดุ
          </label>
          <div className="relative">
            <span
              className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-white/80"
              aria-hidden
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </span>
            <input
              id="header-tracking-search"
              type="search"
              name="q"
              placeholder="ค้นหาเลขพัสดุ"
              required
              className="h-9 w-full rounded-full border-0 bg-white/10 py-1 pl-8 pr-3 text-base text-white outline-none placeholder:text-white/80 focus:ring-2 focus:ring-white/50"
            />
          </div>
        </form>

        <Link
          href="/announcements"
          prefetch
          aria-label="ประกาศจากระบบ"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-white/95 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 active:text-white/80"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8" aria-hidden>
            <path
              d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM9.8 20h4.4"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      </div>
    </header>
  );
}
