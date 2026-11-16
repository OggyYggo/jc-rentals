import { SkeletonBlock } from "@/components/loading/PageSkeletons";

export default function Loading() {
  return <main aria-busy="true" aria-live="polite" className="mx-auto grid max-w-6xl gap-8 px-5 py-10 lg:grid-cols-[1.5fr_1fr]"><span className="sr-only">Loading car details…</span><section><SkeletonBlock className="aspect-[4/3] w-full rounded-3xl"/><SkeletonBlock className="mt-5 h-8 w-2/3"/><SkeletonBlock className="mt-3 h-5 w-1/3"/></section><SkeletonBlock className="h-[32rem] w-full rounded-3xl"/></main>;
}
