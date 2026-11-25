import Link from "next/link";
import { carsUrl, type CarSearch } from "@/lib/cars/searchParams";

export function VehicleFilterTabs({ current, counts, search }: { current?: "car" | "motorcycle"; counts: { all: number; car: number; motorcycle: number }; search: CarSearch }) {
  const tabs = [{ value: undefined, label: "All", count: counts.all }, { value: "car" as const, label: "Cars", count: counts.car }, { value: "motorcycle" as const, label: "Motorcycles", count: counts.motorcycle }];
  return <nav aria-label="Vehicle type" className="flex shrink-0 items-center gap-1 rounded-xl border border-[#D6E6F7] bg-[#F3F9FF] p-1">{tabs.map((tab) => <Link key={tab.label} href={carsUrl({ ...search, vehicle: tab.value })} aria-current={current === tab.value ? "page" : undefined} className={`inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-lg px-2 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] md:px-3 ${current === tab.value ? "bg-[#0B63CE] text-white" : "text-[#0A3D91] hover:bg-[#EAF4FF]"}`}>{tab.label}<span className={`rounded-full px-1.5 py-0.5 text-xs tabular-nums ${current === tab.value ? "bg-white/20" : "bg-[#0B63CE]/10"}`}>{tab.count}</span></Link>)}</nav>;
}
