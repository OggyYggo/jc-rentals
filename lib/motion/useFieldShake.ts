"use client";

import { useCallback, type RefObject } from "react";
import { gsap, MOTION, useGSAP } from "./gsap";

export function useFieldShake(scope: RefObject<HTMLElement | null>) {
  const { contextSafe } = useGSAP({ scope });

  return useCallback((field: HTMLElement | null) => {
    if (!field || !scope.current?.contains(field) || !window.matchMedia(MOTION).matches) return;
    const group = field.closest("label") ?? field;
    contextSafe(() => {
      gsap.to(group, {
        keyframes: { x: [-6, 6, -4, 4, 0] },
        duration: 0.35,
        ease: "none",
        overwrite: true,
        clearProps: "transform",
      });
    })();
  }, [contextSafe, scope]);
}
