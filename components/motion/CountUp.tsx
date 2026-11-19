"use client";

import { numberFormat, useCountUp } from "@/lib/motion/useCountUp";

export function CountUp({ value, onChange = false }: { value: number; onChange?: boolean }) {
  const scope = useCountUp(value, onChange);
  const formatted = numberFormat.format(value);

  return <span className="inline-grid text-right tabular-nums">
    <span className="invisible col-start-1 row-start-1" aria-hidden="true">{formatted}</span>
    <span className="sr-only">{formatted}</span>
    <span ref={scope} aria-hidden="true" className="col-start-1 row-start-1">{formatted}</span>
  </span>;
}
