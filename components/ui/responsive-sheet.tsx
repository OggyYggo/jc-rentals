"use client";

import type { ComponentProps } from "react";
import { Dialog } from "@/components/ui/dialog";

export function ResponsiveSheet({ className = "", desktopFrom = "sm", ...props }: ComponentProps<typeof Dialog.Popup> & { desktopFrom?: "sm" | "lg" }) {
  const desktop = desktopFrom === "lg"
    ? "lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:w-[min(32rem,calc(100%-2rem))] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-2xl lg:p-6 lg:data-starting-style:scale-95 lg:data-ending-style:scale-95"
    : "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(32rem,calc(100%-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:p-6 sm:data-starting-style:scale-95 sm:data-ending-style:scale-95";
  return <Dialog.Portal>
    <Dialog.Backdrop className="fixed inset-0 z-[80] bg-[#0F2342]/45 motion-safe:transition-opacity data-starting-style:opacity-0 data-ending-style:opacity-0" />
    <Dialog.Popup {...props} aria-modal="true"
      className={`fixed inset-x-0 bottom-0 z-[81] max-h-[90dvh] overflow-y-auto overscroll-contain rounded-t-3xl bg-white px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] font-body text-sm text-[#0F2342] shadow-xl motion-safe:transition-[opacity,scale] motion-safe:duration-200 data-starting-style:opacity-0 data-ending-style:opacity-0 ${desktop} ${className}`} />
  </Dialog.Portal>;
}
