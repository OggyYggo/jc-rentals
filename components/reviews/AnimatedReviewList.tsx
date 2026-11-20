"use client";

import type { ReactNode } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";

export function AnimatedReviewList({ children, className, busy }: { children: ReactNode; className?: string; busy?: boolean }) {
  const [list] = useAutoAnimate<HTMLUListElement>({ duration: 180 });
  return <ul ref={list} className={className} aria-busy={busy}>{children}</ul>;
}
