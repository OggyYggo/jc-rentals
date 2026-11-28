import { staffCard } from "@/components/staff/shared";

export default function StaffLoading() {
  return <div className="mx-auto max-w-4xl space-y-3" role="status" aria-label="Loading handover staff">
    {[0,1,2].map(item => <div key={item} aria-hidden className={`${staffCard} h-24 bg-[#F3F9FF]! motion-safe:animate-pulse`} />)}
  </div>;
}
