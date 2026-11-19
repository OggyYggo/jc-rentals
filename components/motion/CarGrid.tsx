"use client";

import { useRef, type ReactNode } from "react";
import { EASE_OUT, gsap, MOTION, ScrollTrigger, useGSAP } from "@/lib/motion/gsap";

export function CarGrid({ children, filterKey }: { children: ReactNode; filterKey: string }) {
  const scope = useRef<HTMLDivElement>(null);
  const seen = useRef(new WeakSet<Element>());
  const previousFilter = useRef(filterKey);

  useGSAP(() => {
    const media = gsap.matchMedia(scope);
    if (previousFilter.current !== filterKey) {
      previousFilter.current = filterKey;
      seen.current = new WeakSet();
    }
    media.add(MOTION, (context) => {
      const cards = Array.from(scope.current!.children).slice(0, 12).filter((card) => !seen.current.has(card));
      if (!cards.length) return;
      ScrollTrigger.batch(cards, {
        start: "top 96%",
        once: true,
        interval: 0.06,
        onEnter: (batch) => {
          context.add(() => {
            batch.forEach((card) => seen.current.add(card));
            gsap.from(batch, { opacity: 0, duration: 0.3, stagger: 0.04, ease: EASE_OUT, clearProps: "opacity" });
          });
        },
      });
    });
    return () => media.revert();
  }, { scope, dependencies: [filterKey], revertOnUpdate: true });

  return <div ref={scope} className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}
