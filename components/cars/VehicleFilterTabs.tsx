import Link from "next/link";
import { carsUrl, type CarSearch } from "@/lib/cars/searchParams";

export function VehicleFilterTabs({ current, counts, search }: { current?: "car" | "motorcycle"; counts: { all: number; car: number; motorcycle: number }; search: CarSearch }) {
  const tabs = [{ value: undefined, label: "All", count: counts.all }, { value: "car" as const, label: "Cars", count: counts.car }, { value: "motorcycle" as const, label: "Motorcycles", count: counts.motorcycle }];
  return <nav aria-label="Vehicle type" className="mt-6 flex flex-wrap gap-2">{tabs.map((tab) => <Link key={tab.label} href={carsUrl({ ...search, vehicle: tab.value })} aria-current={current === tab.value ? "page" : undefined} className={`inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold ${current === tab.value ? "bg-[#0B63CE] text-white" : "border border-[#D6E6F7] bg-white text-[#0A3D91]"}`}>{tab.label}<span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{tab.count}</span></Link>)}</nav>;
}
