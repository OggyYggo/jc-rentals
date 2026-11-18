import { PublicFooter } from "@/components/public-footer";
import { SkeletonBlock } from "@/components/loading/PageSkeletons";

function BookingSummarySkeleton() {
  return <aside aria-hidden="true" className="h-fit rounded-2xl border border-[#D6E6F7] bg-white p-5 shadow-[0_14px_38px_-28px_rgba(10,61,145,.5)] lg:sticky lg:top-24">
    <SkeletonBlock className="h-5 w-40" />
    <div className="mt-4 grid grid-cols-2 gap-3">
      <SkeletonBlock className="h-[68px]" />
      <SkeletonBlock className="h-[68px]" />
      <SkeletonBlock className="col-span-2 h-11 rounded-full" />
    </div>
    <SkeletonBlock className="mt-5 h-5 w-3/4" />
    <SkeletonBlock className="mt-3 h-4 w-full" />
    <SkeletonBlock className="mt-2 h-4 w-5/6" />
    <SkeletonBlock className="mt-5 h-12 w-full rounded-full" />
    <SkeletonBlock className="mt-3 h-3 w-4/5" />
  </aside>;
}

export default function Loading() {
  return <>
    <main aria-busy="true" aria-live="polite" className="theme-public min-h-screen bg-white px-5 py-8 text-[#0F2342] sm:px-8 md:py-12">
      <div className="mx-auto max-w-6xl">
        <span className="sr-only">Loading car details…</span>
        <SkeletonBlock className="h-4 w-20" />
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <SkeletonBlock className="h-9 w-72 max-w-full md:h-11" />
            <SkeletonBlock className="mt-2 h-4 w-40" />
          </div>
          <div className="flex gap-2">
            <SkeletonBlock className="h-9 w-20 rounded-full" />
            <SkeletonBlock className="h-9 w-24 rounded-full" />
            <SkeletonBlock className="hidden h-9 w-24 rounded-full sm:block" />
          </div>
        </div>

        <div className="mt-6 grid items-start gap-7 lg:grid-cols-[1.45fr_0.85fr]">
          <div className="space-y-6">
            <div aria-hidden="true" className="grid grid-cols-2 gap-3">
              <SkeletonBlock className="col-span-2 aspect-[4/3] rounded-2xl" />
              <SkeletonBlock className="aspect-[4/3] rounded-2xl" />
              <SkeletonBlock className="aspect-[4/3] rounded-2xl" />
            </div>

            <section aria-hidden="true" className="rounded-2xl border border-[#D6E6F7] bg-white p-5">
              <div className="flex items-center justify-between gap-3"><SkeletonBlock className="h-5 w-40" /><SkeletonBlock className="h-10 w-44 rounded-full" /></div>
              <SkeletonBlock className="mt-5 h-20 w-full rounded-xl" />
            </section>

            <section aria-hidden="true" className="rounded-2xl border border-[#D6E6F7] bg-white p-5">
              <SkeletonBlock className="h-5 w-32" />
              <SkeletonBlock className="mt-4 h-[310px] w-full rounded-xl" />
            </section>

            <section aria-hidden="true" className="rounded-2xl border border-[#D6E6F7] bg-white p-5">
              <SkeletonBlock className="h-5 w-28" />
              <SkeletonBlock className="mt-4 h-4 w-full" />
              <SkeletonBlock className="mt-2 h-4 w-5/6" />
              <SkeletonBlock className="mt-2 h-4 w-2/3" />
            </section>
          </div>

          <BookingSummarySkeleton />
        </div>
      </div>
    </main>
    <PublicFooter />
  </>;
}
