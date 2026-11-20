"use client";

import { useTransition } from "react";
import { toastError, toastInfo } from "@/lib/alerts/toast";

export function ExportAudit({ href }: { href: string }) {
  const [pending, startTransition] = useTransition();
  function download() {
    startTransition(async () => {
      void toastInfo("Preparing audit log export");
      try {
        const response = await fetch(href, { cache: "no-store" });
        if (!response.ok || !response.headers.get("Content-Type")?.startsWith("text/csv")) {
          throw new Error("Could not export the audit log. Please try again.");
        }
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement("a");
        link.href = url;
        link.download = "audit-log.csv";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (error) {
        await toastError(error);
      }
    });
  }
  return <button type="button" disabled={pending} onClick={download}
    className="rounded-md border border-slate-300 bg-white px-4 py-2 font-medium disabled:opacity-60">
    {pending ? "Preparing CSV…" : "Export CSV"}
  </button>;
}
