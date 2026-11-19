"use client";

import { useSearchParams } from "next/navigation";
import { useRef } from "react";
import { EASE_INOUT, EASE_OUT, gsap, MOTION, useGSAP } from "@/lib/motion/gsap";
import Link from "next/link";
import { CarTile } from "@/components/customer/car-tile";

type Car = Parameters<typeof CarTile>[0]["car"];
type Mode = "all" | "self" | "driver";

export function FeaturedCarsGrid({ cars, mode: initialMode }: { cars: Car[]; mode: Mode }) {
  const query = useSearchParams();
  const rawMode = query.get("mode");
  const mode = rawMode === "driver" || rawMode === "with_driver" ? "driver"
    : rawMode === "self" || rawMode === "self_drive" ? "self"
    : rawMode === null ? "all" : initialMode;
  const scope = useRef<HTMLDivElement>(null);
  const lastMode = useRef<Mode | null>(null);
  const revealed = useRef(false);
  const outgoing = useRef<gsap.core.Tween | null>(null);

  const { contextSafe } = useGSAP(() => {
    const changed = lastMode.current !== null && lastMode.current !== mode;
    lastMode.current = mode;
    if (!changed && revealed.current) return;

    const media = gsap.matchMedia(scope);
    media.add(MOTION, () => {
      if (!changed && revealed.current) return;
      const cards = scope.current!.querySelectorAll("[data-featured-cards] > *");
      const grid = scope.current!.querySelector("[data-featured-cards]");
      if (!grid) return;
      const tween = gsap.from(cards, {
        opacity: 0,
        y: changed ? 0 : 20,
        duration: changed ? 0.3 : 0.6,
        stagger: changed ? 0.05 : 0.08,
        ease: EASE_OUT,
        clearProps: "opacity,transform",
        immediateRender: changed,
        scrollTrigger: changed ? undefined : {
          trigger: grid, start: "top 90%", once: true, onEnter: () => { revealed.current = true; },
        },
      });
      if (changed) revealed.current = true;
      return () => tween.revert();
    });
    return () => {
      outgoing.current = null;
      media.revert();
    };
  }, { scope, dependencies: [mode], revertOnUpdate: true });

  function selectMode(next: Mode) {
    outgoing.current?.revert();
    if (next === mode) return;
    const url = next === "all" ? "/#cars" : `/?mode=${next}#cars`;
    const update = () => window.history.replaceState(null, "", url);
    const cards = scope.current!.querySelector("[data-featured-cards]");
    if (!cards || !window.matchMedia(MOTION).matches) {
      update();
      return;
    }
    outgoing.current = contextSafe(() => gsap.to(cards, {
      opacity: 0, duration: 0.15, ease: EASE_INOUT, onComplete: update,
    }))();
  }
  const matches = (car: Car, selected: Mode) => {
    if (selected === "self") return car.allows_self_drive && (car.car_rates ?? []).some(rate => rate.mode === "self_drive");
    if (selected === "driver") return car.allows_with_driver && (car.car_rates ?? []).some(rate => rate.mode === "with_driver");
    return (car.allows_self_drive && (car.car_rates ?? []).some(rate => rate.mode === "self_drive")) || (car.allows_with_driver && (car.car_rates ?? []).some(rate => rate.mode === "with_driver"));
  };
  const tabs: { mode: Mode; label: string }[] = [{ mode: "all", label: "All cars" }, { mode: "self", label: "Self-drive" }, { mode: "driver", label: "With driver" }];
  const visibleCars = cars.filter(car => matches(car, mode));

  return <div ref={scope}>
    <div role="tablist" aria-label="Filter featured cars by rental mode" className="mt-6 flex flex-wrap gap-2">
      {tabs.map(tab => <button key={tab.mode} type="button" role="tab" aria-selected={mode === tab.mode} onClick={() => selectMode(tab.mode)} className={`rounded-full border px-4 py-2 text-xs font-semibold focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#2E9BF0] ${mode === tab.mode ? "border-[#0B63CE] bg-[#0B63CE] text-white" : "border-[#D6E6F7] bg-white text-[#0A3D91] hover:bg-[#EAF4FF]"}`}>{tab.label} ({cars.filter(car => matches(car, tab.mode)).length})</button>)}
    </div>
    {visibleCars.length ? <div key={mode} data-featured-cards className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{visibleCars.slice(0, 6).map(car => <CarTile key={car.id} car={car} mode={mode === "all" ? undefined : mode} searchParams={mode === "all" ? {} : { mode }}/>)}</div> : <div key={mode} data-featured-cards className="mt-5 rounded-2xl border border-dashed border-[#B7D6F4] bg-[#F5FAFF] p-8 text-center text-sm text-[#51657F]">No featured cars offer this mode yet. <Link className="font-semibold text-[#0B63CE] underline" href="/cars">See all cars</Link></div>}
  </div>;
}
