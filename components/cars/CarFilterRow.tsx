"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function CarFilterRow({ children }: { children: ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const viewport = row.current;
    const track = viewport?.firstElementChild;
    if (!viewport || !track) return;

    function update() {
      if (!viewport) return;
      const left = viewport.scrollLeft > 1;
      const right = viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 1;
      setEdges(current => current.left === left && current.right === right ? current : { left, right });
    }

    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    observer.observe(track);
    viewport.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      observer.disconnect();
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  function move() {
    const viewport = row.current;
    if (!viewport) return;
    const left = edges.right ? viewport.scrollLeft + viewport.clientWidth * 0.8 : 0;
    viewport.scrollTo({ left, behavior: "instant" });
  }

  return <div className="flex min-w-0 items-center gap-1">
    <div ref={row} className="relative -my-1 min-w-0 flex-1 overflow-x-auto overscroll-x-contain md:-mx-1 max-md:[scrollbar-width:none]">
      <div className="flex w-max items-center gap-2 py-1 pr-1 pl-1 whitespace-nowrap">{children}</div>
    </div>
    {(edges.left || edges.right) && <button type="button"
      className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#D6E6F7] bg-white text-[#0A3D91] md:hidden"
      aria-label={edges.right ? "More filters and sorting" : "Back to vehicle filters"} onClick={move}>
      {edges.right ? <ChevronRight size={18} aria-hidden/> : <ChevronLeft size={18} aria-hidden/>}
    </button>}
  </div>;
}
