import { ContentSkeleton } from "@/components/loading/PageSkeletons";

export default function Loading() {
  return <>
    <div role="status" aria-label="Loading admin page" className="space-y-3 lg:hidden">
      <div className="h-14 w-3/4 rounded-xl bg-white motion-safe:animate-pulse"/>
      {[1, 2, 3, 4].map(item => <div key={item} className="h-32 rounded-xl border border-[#E3EEF9] bg-white motion-safe:animate-pulse"/>)}
    </div>
    <div className="hidden lg:block"><ContentSkeleton rows={8}/></div>
  </>;
}
