"use client";

import { useRef, type RefObject } from "react";
import { EASE_OUT, gsap, MOTION, useGSAP } from "./gsap";

export function useReveal(
  scope: RefObject<HTMLElement | null>,
  { desktop = false, intro = false }: { desktop?: boolean; intro?: boolean } = {},
) {
  const seen = useRef(new WeakSet<Element>());

  useGSAP(() => {
    const root = scope.current!;
    const media = gsap.matchMedia(scope);
    media.add(desktop ? `${MOTION} and (min-width: 1024px)` : MOTION, () => {
      if (intro) {
        const timeline = gsap.timeline({ defaults: { ease: EASE_OUT, clearProps: "transform,opacity" } });
        timeline
          .from("[data-intro]", { y: 16, duration: 0.5, stagger: 0.08 }, 0)
          .from("[data-intro-trust]", { y: 12, opacity: 0, duration: 0.5, stagger: 0.05 }, 0.22)
          .from("[data-intro-card]", { y: 20, duration: 0.6 }, 0.43);
      }

      const reveal = (trigger: Element, targets: Element[], line?: Element | null, mask?: Element | null) => {
        if (seen.current.has(trigger) || !targets.length) return;
        const timeline = gsap.timeline({
          defaults: { ease: EASE_OUT, clearProps: "transform,opacity" },
          scrollTrigger: {
            trigger,
            start: "top 90%",
            once: true,
            onEnter: () => seen.current.add(trigger),
          },
        });
        if (mask) timeline.fromTo(mask, { clipPath: "inset(0 0 100% 0 round 18px)" }, {
          clipPath: "inset(0 0 0% 0 round 18px)", duration: 0.9, immediateRender: false, clearProps: "clipPath",
        }, 0);
        const delay = Number(trigger.getAttribute("data-reveal-delay") ?? 0);
        timeline.from(targets, { y: 20, opacity: 0, duration: 0.6, stagger: 0.1, immediateRender: false }, mask ? 0.35 : delay);
        if (line) timeline.from(line, { scaleX: 0, duration: 0.65, immediateRender: false }, 0);
      };

      root.querySelectorAll("[data-reveal]").forEach((element) => reveal(element, [element]));
      root.querySelectorAll("[data-reveal-stagger]").forEach((group) => {
        const items = Array.from(group.querySelectorAll("[data-reveal-item]"));
        reveal(group, items, group.querySelector("[data-reveal-line]"), group.querySelector("[data-reveal-mask]"));
      });
    });
    return () => media.revert();
  }, { scope });
}
