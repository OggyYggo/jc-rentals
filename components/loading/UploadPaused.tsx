"use client";

import { useConnectionStatus } from "@/lib/connection/provider";

export function UploadPaused({ fileName, description = "Your reference and amount are kept while you retry.", onRetry, onCancel, busy }: {
  fileName: string; description?: string; onRetry: () => void; onCancel: () => void; busy?: boolean;
}) {
  const offline = useConnectionStatus() === "offline";
  const button = "min-h-11 rounded-xl px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A47B1] disabled:opacity-60";
  return <section className="space-y-2 rounded-2xl border border-[#F1D798] bg-[#FFF2D6] p-4 text-sm text-[#8A5A00]">
    <div role="status"><h3 className="font-heading font-bold">Upload paused</h3>
      <p className="break-words">{fileName}</p><p>{description}</p></div>
    <div aria-hidden className="h-2 rounded-full bg-[#F1D798]" />
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={offline || busy} onClick={onRetry} className={`${button} bg-[#0A47B1] text-white`}>{offline ? "Needs internet to continue" : busy ? "Uploading…" : "Retry upload"}</button>
      <button type="button" disabled={busy} onClick={onCancel} className={`${button} bg-white`}>Cancel</button>
    </div>
  </section>;
}
