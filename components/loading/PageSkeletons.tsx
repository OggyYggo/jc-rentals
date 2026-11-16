export function SkeletonBlock({ className = "" }: { className?: string }) { return <div aria-hidden="true" className={`skeleton-shimmer rounded-xl ${className}`} />; }

export function CarGridSkeleton() {
  return <div aria-busy="true" aria-live="polite" className="mx-auto max-w-[1440px] px-5 py-10 lg:px-[140px]"><span className="sr-only">Loading cars…</span><div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="rounded-3xl border border-[#D6E6F7] p-4"><SkeletonBlock className="h-48 w-full rounded-2xl"/><SkeletonBlock className="mt-4 h-5 w-2/3"/><SkeletonBlock className="mt-2 h-4 w-1/3"/><SkeletonBlock className="mt-5 h-11 w-full rounded-full"/></div>)}</div></div>;
}

export function ContentSkeleton({ rows = 4 }: { rows?: number }) {
  return <div aria-busy="true" aria-live="polite" className="space-y-4 p-5"><span className="sr-only">Loading…</span>{Array.from({ length: rows }, (_, i) => <SkeletonBlock key={i} className="h-16 w-full" />)}</div>;
}
