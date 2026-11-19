"use client";

import { useRef } from "react";
import { EASE_OUT, gsap, MOTION, useGSAP } from "./gsap";

export const numberFormat = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 });

export function useCountUp(value: number, onChange: boolean) {
  const scope = useRef<HTMLSpanElement>(null);
  const previous = useRef(value);
  const played = useRef(false);

  useGSAP(() => {
    const start = onChange ? previous.current : 0;
    previous.current = value;
    const text = scope.current!;
    text.textContent = numberFormat.format(value);
    if (onChange ? start === value : played.current) return;

    const media = gsap.matchMedia();
    media.add(MOTION, () => {
      const counter = { value: start };
      gsap.to(counter, {
        value,
        duration: onChange ? 0.4 : 1.2,
        ease: EASE_OUT,
        scrollTrigger: onChange ? undefined : {
          trigger: text, start: "top 90%", once: true, onEnter: () => { played.current = true; },
        },
        onUpdate: () => { text.textContent = numberFormat.format(Number.isInteger(value) ? Math.round(counter.value) : counter.value); },
      });
      return () => { text.textContent = numberFormat.format(value); };
    });
    return () => media.revert();
  }, { scope, dependencies: [value, onChange], revertOnUpdate: true });

  return scope;
}
