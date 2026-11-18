"use client";

import { useRouter } from "next/navigation";
import type { CarSearch } from "@/lib/cars/searchParams";
import { carsUrl } from "@/lib/cars/searchParams";

type TabMode = "all" | "self" | "driver";

export function CarFilterTabs({ current, counts, search }: { current: TabMode; counts: Record<TabMode, number>; search: CarSearch }) {
  const router = useRouter();
  const tabs: { mode: TabMode; label: string }[] = [
    { mode: "all", label: "All cars" },
    { mode: "self", label: "Self-drive" },
    { mode: "driver", label: "With driver" },
  ];

  function changeMode(mode: TabMode) {
    router.replace(carsUrl({ ...search, mode: mode === "all" ? undefined : mode }), { scroll: false });
  }

  return <div role="tablist" aria-label="Filter cars by rental mode" className="mt-6 flex flex-wrap gap-2">
    {tabs.map(({ mode, label }) => <button key={mode} type="button" role="tab" aria-selected={current === mode} onClick={() => changeMode(mode)} className={`rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#2E9BF0] ${current === mode ? "border-[#0B63CE] bg-[#0B63CE] text-white" : "border-[#D6E6F7] bg-white text-[#0A3D91] hover:bg-[#EAF4FF]"}`}>{label} ({counts[mode]})</button>)}
  </div>;
}
