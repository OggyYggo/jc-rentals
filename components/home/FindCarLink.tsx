"use client";

import { useCallback } from "react";
import { ArrowRight } from "lucide-react";

export function FindCarLink() {
  const findCar = useCallback(() => {
    const target = document.getElementById("top");
    const input = document.getElementById("pickup-date") as HTMLInputElement | null;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const focusDate = () => {
      input?.focus({ preventScroll: true });
      try { input?.showPicker(); } catch { /* Some browsers do not expose the native picker. */ }
    };
    if (reducedMotion || !target) {
      target?.scrollIntoView({ behavior: "auto", block: "start" });
      focusDate();
      return;
    }
    let focused = false;
    const focusOnce = () => {
      if (focused) return;
      focused = true;
      document.removeEventListener("scrollend", focusOnce);
      focusDate();
    };
    document.addEventListener("scrollend", focusOnce, { once: true });
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(focusOnce, 1200);
  }, []);

  return <button type="button" onClick={findCar} className="mt-7 inline-flex h-[54px] w-full items-center justify-center gap-2 rounded-full bg-white px-9 font-semibold text-[#0A47B1] transition-colors hover:bg-[#EAF4FF] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#2E9BF0] md:w-auto">Find your car<ArrowRight size={16} aria-hidden="true"/></button>;
}
