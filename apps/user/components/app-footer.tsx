import { APP_RELEASE_DATE, APP_VERSION, formatAppReleaseLabel } from "@/lib/app-release";

export function AppFooter() {
  return (
    <footer
      className="mx-auto w-full max-w-lg px-6 pb-6 pt-10 text-center"
      aria-label="Application information"
    >
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
        Powered by SSS
      </p>
      <p className="text-[10px] leading-relaxed text-slate-400/90">
        Copyright © Powered by Super Solution System Co., Ltd.
      </p>
      <p
        className="mt-2 text-[10px] tabular-nums tracking-wide text-slate-400/70"
        title={`Release ${APP_VERSION} · ${APP_RELEASE_DATE}`}
      >
        {formatAppReleaseLabel()}
      </p>
    </footer>
  );
}
