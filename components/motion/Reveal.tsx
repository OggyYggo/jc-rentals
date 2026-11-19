"use client";

import { useRef, type ComponentPropsWithoutRef } from "react";
import { useReveal } from "@/lib/motion/useReveal";

type Props = ComponentPropsWithoutRef<"div"> & {
  as?: "div" | "section" | "main" | "aside";
  desktop?: boolean;
  intro?: boolean;
};

export function Reveal({ as: Tag = "div", desktop, intro, ...props }: Props) {
  const scope = useRef<HTMLDivElement>(null);
  useReveal(scope, { desktop, intro });
  return <Tag ref={scope} {...props} />;
}
