import { staffCard } from "@/components/staff/shared";

export default function LoadingStaffWorkspace() {
  return <main role="status" aria-label="Loading handovers" className="mx-auto max-w-2xl space-y-3 p-4">
    {[0,1,2].map(row => <div key={row} aria-hidden className={`${staffCard} h-20 bg-[#EAF4FF]! motion-safe:animate-pulse`} />)}
  </main>;
}
