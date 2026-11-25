"use client";

import { useRouter } from "next/navigation";
import type { CarSearch } from "@/lib/cars/searchParams";
import { carsUrl } from "@/lib/cars/searchParams";

type TabMode = "all" | "self" | "driver";

export function CarFilterTabs({ current, counts, search, motorcycle = false }: { current: TabMode; counts: Record<TabMode, number>; search: CarSearch; motorcycle?: boolean }) {
  const router = useRouter();
  const tabs: { mode: TabMode; label: string }[] = [
    { mode: "all", label: "Any mode" },
    { mode: "self", label: "Self-drive" },
    { mode: "driver", label: "With driver" },
  ];

  function changeMode(mode: TabMode) {
    router.replace(carsUrl({ ...search, mode: mode === "all" ? undefined : mode }), { scroll: false });
  }

  return <div role="tablist" aria-label="Filter vehicles by rental mode" className="flex shrink-0 items-center gap-1.5">
    {tabs.filter((tab) => !motorcycle || tab.mode !== "driver").map(({ mode, label }) => <button key={mode} type="button" role="tab" aria-selected={current === mode} onClick={() => changeMode(mode)} className={`inline-flex min-h-11 items-center gap-1 rounded-full border px-2.5 text-[13px] font-semibold motion-safe:transition-colors md:px-4 focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#2E9BF0] ${current === mode ? "border-[#0B63CE] bg-[#0B63CE] text-white" : "border-[#D6E6F7] bg-white text-[#0A3D91] hover:bg-[#EAF4FF]"}`}>{label}{mode !== "all" && <span className={`rounded-full px-1.5 py-0.5 text-xs tabular-nums ${current === mode ? "bg-white/20" : "bg-[#EAF4FF]"}`}>{counts[mode]}</span>}</button>)}
  </div>;
}
