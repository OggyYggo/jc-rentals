"use client";

import { useRef } from "react";
import { EASE_OUT, gsap, MOTION, useGSAP } from "@/lib/motion/gsap";

export function DrawCheck({ size = 28 }: { size?: number }) {
  const scope = useRef<SVGSVGElement>(null);

  useGSAP(() => {
    const media = gsap.matchMedia(scope);
    media.add(MOTION, () => {
      gsap.from("path", { strokeDashoffset: 1, duration: 0.6, ease: EASE_OUT });
    });
    return () => media.revert();
  }, { scope });

  return <svg ref={scope} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="m5 12 4 4L19 6" pathLength={1} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={1} />
  </svg>;
}
