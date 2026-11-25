"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SkeletonBlock } from "@/components/loading/PageSkeletons";

export function OwnerRouteLoading({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname !== "/owner") return children;
  return <>
    <div className="space-y-4 sm:hidden" role="status" aria-busy="true">
      <span className="sr-only">Loading dashboard</span>
      <div className="space-y-2"><SkeletonBlock className="h-4 w-24" /><SkeletonBlock className="h-8 w-52 max-w-full" /></div>
      <div className="grid grid-cols-[1.4fr_1fr] gap-2"><SkeletonBlock className="h-[50px]" /><SkeletonBlock className="h-[50px]" /></div>
      <SkeletonBlock className="h-36" />
      <SkeletonBlock className="h-48" />
      <SkeletonBlock className="h-24" />
    </div>
    <div className="hidden sm:block">{children}</div>
  </>;
}
