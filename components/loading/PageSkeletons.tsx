import { PublicFooter } from "@/components/public-footer";

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton-shimmer rounded-xl ${className}`} />;
}

function CarTileSkeleton() {
  return <div aria-hidden="true" className="overflow-hidden rounded-3xl border border-[#D6E6F7] bg-white shadow-[0_8px_28px_-22px_rgba(10,61,145,.4)]">
    <SkeletonBlock className="aspect-[4/3] w-full rounded-none" />
    <div className="p-5">
      <SkeletonBlock className="h-6 w-3/4" />
      <SkeletonBlock className="mt-2 h-4 w-2/5" />
      <div className="mt-4 flex gap-2"><SkeletonBlock className="h-8 w-24 rounded-full" /><SkeletonBlock className="h-8 w-28 rounded-full" /></div>
      <SkeletonBlock className="mt-5 h-11 w-full rounded-full" />
    </div>
  </div>;
}

export function CarGridSkeleton() {
  return <>
    <main aria-busy="true" aria-live="polite" className="theme-public min-h-screen bg-white px-5 py-10 text-[#0F2342] sm:px-8 md:py-14">
      <div className="mx-auto max-w-6xl">
        <span className="sr-only">Loading cars…</span>
        <SkeletonBlock className="h-4 w-28 rounded-full" />
        <SkeletonBlock className="mt-3 h-10 w-64 max-w-full" />

        <div className="mt-7 flex gap-2 overflow-hidden">
          <SkeletonBlock className="h-10 w-28 shrink-0 rounded-full" />
          <SkeletonBlock className="h-10 w-36 shrink-0 rounded-full" />
          <SkeletonBlock className="h-10 w-36 shrink-0 rounded-full" />
        </div>

        <SkeletonBlock className="mt-4 hidden h-[76px] w-full rounded-2xl md:block" />
        <SkeletonBlock className="mt-4 h-12 w-full rounded-xl md:hidden" />
        <SkeletonBlock className="mt-6 h-4 w-48" />

        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => <CarTileSkeleton key={index} />)}
        </div>
      </div>
    </main>
    <PublicFooter />
  </>;
}

export function ContentSkeleton({ rows = 4 }: { rows?: number }) {
  return <div aria-busy="true" aria-live="polite" className="space-y-4 p-5"><span className="sr-only">Loading…</span>{Array.from({ length: rows }, (_, i) => <SkeletonBlock key={i} className="h-16 w-full" />)}</div>;
}
