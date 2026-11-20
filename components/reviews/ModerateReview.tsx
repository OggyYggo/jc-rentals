"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { runWithAlerts } from "@/lib/alerts/run";
import { moderateTripReview, resolveTripReport } from "@/lib/reviews/actions";
import { reportReasons, reviewErrors } from "@/lib/reviews/model";

const button = "rounded-md border px-3 py-2 font-medium disabled:opacity-50";

export function ModerateReview({ id, hidden }: { id: string; hidden: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  function moderate(hide: boolean, reason: string) {
    return runWithAlerts({
      confirm: { title: hide ? "Hide this review?" : "Restore this review?", confirmText: hide ? "Hide review" : "Restore review", danger: hide },
      setPending: setBusy,
      run: async () => {
        const result = await moderateTripReview(id, hide, reason);
        if (result.error) throw new Error(reviewErrors[result.error]);
      },
      success: hide ? "Review hidden" : "Review restored",
      refresh: router.refresh,
    });
  }
  if (hidden) return <button type="button" disabled={busy} className={button} onClick={() => moderate(false, "")}>Unhide</button>;
  return <details><summary className="cursor-pointer font-medium text-red-800">Hide review</summary>
    <form className="mt-2 max-w-md space-y-2" onSubmit={event => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      const reason = fields.get("reason") as keyof typeof reportReasons;
      const note = String(fields.get("note") ?? "").trim();
      if (reason in reportReasons) void moderate(true, reportReasons[reason] + (note ? " · " + note : ""));
    }}>
      <label className="block">Reason<select name="reason" required className="ml-2 rounded border bg-white p-2">
        <option value="">Choose a reason</option>{Object.entries(reportReasons).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label className="block">Note (optional)<textarea name="note" maxLength={260} rows={2} className="block w-full rounded border p-2"/></label>
      <p className="text-xs text-slate-600">Do not include ID numbers or bank details.</p>
      <button disabled={busy} className={button}>Hide review</button>
    </form>
  </details>;
}

export function ResolveReport({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <div className="mt-2 flex flex-wrap gap-2">
    {(["dismissed", "actioned"] as const).map(action => {
      const label = action === "dismissed" ? "Dismiss report" : "Mark actioned";
      return <button key={action} disabled={busy} className={button} type="button" onClick={() => runWithAlerts({
        confirm: { title: label + "?", confirmText: label }, setPending: setBusy,
        run: async () => {
          const result = await resolveTripReport(id, action);
          if (result.error) throw new Error(reviewErrors[result.error]);
        },
        success: "Report updated", refresh: router.refresh,
      })}>{label}</button>;
    })}
  </div>;
}
