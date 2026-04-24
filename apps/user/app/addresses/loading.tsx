import { PageShellSkeleton, Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <PageShellSkeleton
      rows={5}
      renderRow={(i) => (
        <article key={i} className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-full max-w-sm" />
              <Skeleton className="h-3 w-3/4 max-w-xs" />
            </div>
            <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
          </div>
        </article>
      )}
    />
  );
}
