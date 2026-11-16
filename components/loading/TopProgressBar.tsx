"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function ProgressBar() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [target, setTarget] = useState<string | null>(null);
  const current = `${pathname}${search.size ? `?${search.toString()}` : ""}`;
  const active = target !== null && target !== current;
  useEffect(() => {
    const start = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLAnchorElement>("a[href]");
      if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.getAttribute("target") === "_blank") return;
      const url = new URL(link.href, window.location.href);
      const next = `${url.pathname}${url.search}`;
      if (url.origin === window.location.origin && next !== `${window.location.pathname}${window.location.search}`) setTarget(next);
    };
    document.addEventListener("click", start);
    return () => document.removeEventListener("click", start);
  }, []);
  useEffect(() => { if (target === null) return; const timer = window.setTimeout(() => setTarget(null), 15000); return () => window.clearTimeout(timer); }, [target]);
  return <div aria-hidden="true" className={`fixed inset-x-0 top-0 z-[100] h-[3px] bg-[#0B63CE] shadow-[0_0_10px_#0B63CE] transition-opacity duration-200 motion-reduce:transition-none ${active ? "opacity-100" : "opacity-0"}`}><div className={`h-full bg-white/50 transition-[width] duration-500 motion-reduce:transition-none ${active ? "w-4/5" : "w-0"}`} /></div>;
}

export function TopProgressBar() { return <Suspense fallback={null}><ProgressBar /></Suspense>; }
