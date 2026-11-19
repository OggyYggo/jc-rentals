"use client";

import { useRef, type ReactNode } from "react";
import { gsap, MOTION, useGSAP } from "@/lib/motion/gsap";

export function ParallaxImage({ children }: { children: ReactNode }) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add(`${MOTION} and (min-width: 1024px)`, () => {
      const layer = scope.current!;
      gsap.fromTo(layer, { y: -24 }, {
        y: 24,
        ease: "none",
        scrollTrigger: { trigger: layer.parentElement, start: "top bottom", end: "bottom top", scrub: true },
      });
    });
    return () => media.revert();
  }, { scope });

  return <div ref={scope} className="absolute inset-0 lg:-inset-y-6">{children}</div>;
}
