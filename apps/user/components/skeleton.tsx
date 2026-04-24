import type { HTMLAttributes } from "react";
import { Fragment } from "react";

const pulse = "animate-pulse rounded-md bg-slate-200/90";

type SkeletonProps = HTMLAttributes<HTMLDivElement>;

/** Base block; use for custom layouts across the app. */
export function Skeleton({ className = "", ...rest }: SkeletonProps) {
  return <div className={`${pulse} ${className}`.trim()} {...rest} />;
}

type SkeletonTextProps = {
  lines?: number;
  className?: string;
  /** Tailwind width class for the last line (e.g. `w-2/3`). */
  lastLineClassName?: string;
};

/** Stacked lines for paragraphs or list previews. */
export function SkeletonText({ lines = 3, className = "", lastLineClassName = "w-4/5" }: SkeletonTextProps) {
  return (
    <div className={`space-y-2 ${className}`.trim()} aria-hidden>
      {Array.from({ length: lines }, (_, i) => {
        const isLast = i === lines - 1;
        return <Skeleton key={i} className={`h-3.5 ${isLast ? lastLineClassName : "w-full"}`.trim()} />;
      })}
    </div>
  );
}

type SendAddressCardSkeletonProps = {
  /** Match send flow: book icon placeholder on the right. */
  showIcon?: boolean;
  /** Announced to screen readers. */
  ariaLabel?: string;
};

/**
 * Skeleton for sender/recipient rows on `/send` (and similar address pickers).
 * Reuse `Skeleton` / `SkeletonText` elsewhere for consistent loading UI.
 */
export function SendAddressCardSkeleton({
  showIcon = true,
  ariaLabel = "กำลังโหลดข้อมูลที่อยู่",
}: SendAddressCardSkeletonProps) {
  return (
    <div className="flex items-start justify-between gap-2 py-1" role="status" aria-live="polite" aria-label={ariaLabel}>
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-4 w-full max-w-[min(100%,20rem)]" />
        <Skeleton className="h-3 w-full max-w-[min(100%,22rem)]" />
        <Skeleton className="h-3 w-14" />
      </div>
      {showIcon ? <Skeleton className="h-8 w-8 shrink-0 rounded-lg" /> : null}
    </div>
  );
}

type PageShellSkeletonProps = {
  /** Number of card rows under the hero. Defaults to 4. */
  rows?: number;
  /** Render function for each row; defaults to a generic list card. */
  renderRow?: (index: number) => React.ReactNode;
  /** Optional slot rendered directly under the hero, before the rows. */
  topCard?: React.ReactNode;
};

/**
 * Route-segment loading skeleton that matches every page's blue hero + list layout.
 * Used by `app/**\/loading.tsx` files so nav streams a matching shell before data.
 */
export function PageShellSkeleton({ rows = 4, renderRow, topCard }: PageShellSkeletonProps) {
  return (
    <main className="min-h-screen bg-slate-100 pb-28">
      <section className="bg-[#2726F5] px-6 pb-14 pt-10 text-white">
        <div className="mx-auto w-full max-w-lg">
          <Skeleton className="h-8 w-40 bg-white/30" />
          <Skeleton className="mt-2 h-4 w-56 bg-white/20" />
        </div>
      </section>

      <section className="-mt-8 px-6">
        <div className="mx-auto w-full max-w-lg space-y-3">
          {topCard}
          {Array.from({ length: rows }).map((_, i) =>
            renderRow ? (
              <Fragment key={i}>{renderRow(i)}</Fragment>
            ) : (
              <article key={i} className="rounded-lg bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-8 w-24 rounded-full" />
                </div>
              </article>
            ),
          )}
        </div>
      </section>
    </main>
  );
}

/** Full summary card stack for `/send/review` while sender/recipient APIs load. */
export function ReviewOrderSummarySkeleton() {
  return (
    <div
      className="space-y-4 text-sm"
      role="status"
      aria-live="polite"
      aria-label="กำลังโหลดสรุปคำสั่งซื้อ"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0 space-y-2 rounded-lg border border-slate-200 p-3">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-full" />
        </div>
        <div className="min-w-0 space-y-2 rounded-lg border border-slate-200 p-3">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-full" />
        </div>
      </div>

      <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 p-3">
        <Skeleton className="h-3 w-40 shrink-0" />
        <Skeleton className="h-4 w-36 shrink-0" />
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <Skeleton className="mb-3 h-3 w-36" />
        <div className="grid grid-cols-2 gap-y-3">
          {Array.from({ length: 8 }, (_, i) => (
            <Fragment key={i}>
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3.5 max-w-[10rem] justify-self-end" />
            </Fragment>
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-slate-200 p-3">
        <Skeleton className="h-3 w-12" />
        <div className="flex justify-between gap-4">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3.5 w-20" />
        </div>
        <div className="flex justify-between gap-4">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3.5 w-16" />
        </div>
        <div className="border-t border-slate-200 pt-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-6 w-24" />
          </div>
        </div>
        <Skeleton className="h-3 w-full" />
      </div>
    </div>
  );
}
