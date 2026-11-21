"use client";

import { Dialog } from "@base-ui/react/dialog";
import type { ComponentProps } from "react";

export { Dialog };

export function DialogPanel({ className = "", ...props }: ComponentProps<typeof Dialog.Popup>) {
  return <Dialog.Portal>
    <Dialog.Backdrop className="fixed inset-0 z-50 bg-slate-950/50" />
    <Dialog.Popup {...props} className={`fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-2xl bg-white p-5 text-slate-900 shadow-xl ${className}`} />
  </Dialog.Portal>;
}
