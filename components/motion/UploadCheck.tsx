"use client";

import { Check } from "lucide-react";
import { useRef } from "react";
import { EASE_OUT, gsap, MOTION, useGSAP } from "@/lib/motion/gsap";

export function UploadCheck() {
  const scope = useRef<HTMLSpanElement>(null);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add(MOTION, () => {
      gsap.from(scope.current!, { scale: 0.8, opacity: 0, duration: 0.25, ease: EASE_OUT, clearProps: "transform,opacity" });
    });
    return () => media.revert();
  }, { scope });

  return <span ref={scope} className="inline-flex shrink-0 rounded-full bg-[#E8F7EF] p-0.5 text-[#1E8E5A]" aria-hidden="true"><Check size={12} /></span>;
}
