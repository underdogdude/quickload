type UserHeaderProps = {
  displayName?: string | null;
  pictureUrl?: string | null;
};

export function UserHeader({ displayName, pictureUrl }: UserHeaderProps) {
  const label = displayName?.trim() || "ผู้ใช้ LINE";

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/95 px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex max-w-lg items-center gap-3">
        {pictureUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- LINE CDN; avoids remotePatterns setup
          <img
            src={pictureUrl}
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-emerald-100"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800"
            aria-hidden
          >
            {label.slice(0, 1)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">{label}</p>
          <p className="text-xs text-slate-500">บัญชี LINE</p>
        </div>
        <form action="/api/auth/signout" method="post">
          <button type="submit" className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50">
            Logout
          </button>
        </form>
      </div>
    </header>
  );
}
