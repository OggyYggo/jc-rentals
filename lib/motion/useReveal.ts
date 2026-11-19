"use client";

import { useRef, type RefObject } from "react";
import { EASE_OUT, gsap, MOTION, useGSAP } from "./gsap";
import { observeReveal } from "./observeReveal";

export function useReveal(
  scope: RefObject<HTMLElement | null>,
  { desktop = false, intro = false }: { desktop?: boolean; intro?: boolean } = {},
) {
  const seen = useRef(new WeakSet<Element>());
  const introPlayed = useRef(false);

  useGSAP(() => {
    const root = scope.current!;
    const media = gsap.matchMedia(scope);
    media.add(desktop ? `${MOTION} and (min-width: 1024px)` : MOTION, (context) => {
      if (intro && !introPlayed.current) {
        gsap.delayedCall(0, () => {
          if (window.scrollY > 32 || root.getBoundingClientRect().top >= window.innerHeight) return;
          introPlayed.current = true;
          context.add(() => {
            gsap.timeline({ defaults: { ease: EASE_OUT, clearProps: "transform,opacity" } })
              .from("[data-intro]", { y: 8, duration: 0.4, stagger: 0.05 }, 0)
              .from("[data-intro-trust]", { y: 6, opacity: 0.85, duration: 0.38, stagger: 0.04 }, 0.12)
              .from("[data-intro-card]", { y: 10, duration: 0.45 }, 0.2);
          });
        });
      }

      const cleanups: (() => void)[] = [];

      function observe(targets: Element[], delay = 0) {
        const cleanup = observeReveal(targets.filter((target) => !seen.current.has(target)), (entering) => {
          entering.forEach((target) => seen.current.add(target));
          const line = entering.find((target) => target.hasAttribute("data-reveal-line"));
          const items = entering.filter((target) => target !== line);
          context.add(() => {
            if (items.length) gsap.from(items, {
              y: 10, opacity: 0.8, duration: 0.4, stagger: 0.06, delay, ease: EASE_OUT,
              immediateRender: delay === 0, clearProps: "transform,opacity",
            });
            if (line) gsap.from(line, { scaleX: 0.5, duration: 0.45, ease: EASE_OUT, clearProps: "transform" });
          });
        });
        if (cleanup) cleanups.push(cleanup);
      }

      observe(Array.from(root.querySelectorAll("[data-reveal]")));
      root.querySelectorAll("[data-reveal-stagger]").forEach((group) => {
        const targets = Array.from(group.querySelectorAll("[data-reveal-item], [data-reveal-line]"));
        observe(targets, Number(group.getAttribute("data-reveal-delay") ?? 0));
      });
      return () => cleanups.forEach((cleanup) => cleanup());
    });
    return () => media.revert();
  }, { scope });
}
