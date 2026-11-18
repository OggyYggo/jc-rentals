"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { CarTile } from "@/components/customer/car-tile";

type Car = Parameters<typeof CarTile>[0]["car"];
type Mode = "all" | "self" | "driver";

export function FeaturedCarsGrid({ cars, mode }: { cars: Car[]; mode: Mode }) {
  const router = useRouter();
  const matches = (car: Car, selected: Mode) => {
    if (selected === "self") return car.allows_self_drive && (car.car_rates ?? []).some(rate => rate.mode === "self_drive");
    if (selected === "driver") return car.allows_with_driver && (car.car_rates ?? []).some(rate => rate.mode === "with_driver");
    return (car.allows_self_drive && (car.car_rates ?? []).some(rate => rate.mode === "self_drive")) || (car.allows_with_driver && (car.car_rates ?? []).some(rate => rate.mode === "with_driver"));
  };
  const tabs: { mode: Mode; label: string }[] = [{ mode: "all", label: "All cars" }, { mode: "self", label: "Self-drive" }, { mode: "driver", label: "With driver" }];
  const visibleCars = cars.filter(car => matches(car, mode));

  return <>
    <div role="tablist" aria-label="Filter featured cars by rental mode" className="mt-6 flex flex-wrap gap-2">
      {tabs.map(tab => <button key={tab.mode} type="button" role="tab" aria-selected={mode === tab.mode} onClick={() => router.replace(tab.mode === "all" ? "/#cars" : `/?mode=${tab.mode}#cars`, { scroll: false })} className={`rounded-full border px-4 py-2 text-xs font-semibold focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#2E9BF0] ${mode === tab.mode ? "border-[#0B63CE] bg-[#0B63CE] text-white" : "border-[#D6E6F7] bg-white text-[#0A3D91] hover:bg-[#EAF4FF]"}`}>{tab.label} ({cars.filter(car => matches(car, tab.mode)).length})</button>)}
    </div>
    {visibleCars.length ? <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{visibleCars.slice(0, 6).map(car => <CarTile key={car.id} car={car} mode={mode === "all" ? undefined : mode} searchParams={mode === "all" ? {} : { mode }}/>)}</div> : <div className="mt-5 rounded-2xl border border-dashed border-[#B7D6F4] bg-[#F5FAFF] p-8 text-center text-sm text-[#51657F]">No featured cars offer this mode yet. <Link className="font-semibold text-[#0B63CE] underline" href="/cars">See all cars</Link></div>}
  </>;
}
