"use client";

import { useRef, type ReactNode } from "react";
import { EASE_OUT, gsap, MOTION, useGSAP } from "@/lib/motion/gsap";
import { observeReveal } from "@/lib/motion/observeReveal";

export function CarGrid({ children, filterKey }: { children: ReactNode; filterKey: string }) {
  const scope = useRef<HTMLDivElement>(null);
  const seen = useRef(new WeakSet<Element>());
  const previousFilter = useRef(filterKey);

  useGSAP(() => {
    const media = gsap.matchMedia(scope);
    const filterChanged = previousFilter.current !== filterKey;
    if (filterChanged) {
      previousFilter.current = filterKey;
      seen.current = new WeakSet();
    }
    media.add(MOTION, (context) => {
      const cards = Array.from(scope.current!.children).slice(0, 12).filter((card) => !seen.current.has(card));
      if (!cards.length) return;
      if (filterChanged) {
        cards.forEach((card) => seen.current.add(card));
        gsap.from(cards, { opacity: 0.8, duration: 0.24, stagger: 0.025, ease: EASE_OUT, clearProps: "opacity" });
        return;
      }
      return observeReveal(cards, (entering) => {
        entering.forEach((card) => seen.current.add(card));
        context.add(() => {
          gsap.from(entering, { opacity: 0.8, duration: 0.3, stagger: 0.04, ease: EASE_OUT, clearProps: "opacity" });
        });
      });
    });
    return () => media.revert();
  }, { scope, dependencies: [filterKey], revertOnUpdate: true });

  return <div ref={scope} className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}
