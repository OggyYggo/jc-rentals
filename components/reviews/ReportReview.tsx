"use client";

import { Flag } from "lucide-react";
import { useState, useTransition } from "react";
import { reportTripReview } from "@/lib/reviews/actions";
import { reportReasons, reviewErrors } from "@/lib/reviews/model";
import { toastSuccess } from "@/lib/alerts/toast";

export function ReportReview({ id, variant }: { id: string; variant?: "vehicle" }) {
  const [status, setStatus] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  if (sent) return <p role="status" className="mt-2 text-sm">Report submitted.</p>;
  const vehicle = variant === "vehicle";
  return <details className="mt-3 text-sm">
    <summary className={vehicle ? "inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-lg px-1 text-xs font-semibold text-[#405672] hover:text-[#0A3D91] hover:underline focus-visible:outline-2 focus-visible:outline-blue-700 [&::-webkit-details-marker]:hidden" : "cursor-pointer text-blue-800 underline"}>
      {vehicle && <Flag size={13} aria-hidden="true" />}Report review
    </summary>
    <form className="mt-2 max-w-md space-y-2" onSubmit={event => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      start(async () => {
        try {
          const response = await reportTripReview(id, String(fields.get("reason")), String(fields.get("note") ?? ""));
          if (response.error) return setStatus(reviewErrors[response.error] ?? reviewErrors.REVIEW_UNAVAILABLE);
          setSent(true);
          void toastSuccess("Report submitted");
        } catch {
          setStatus(reviewErrors.REVIEW_UNAVAILABLE);
        }
      });
    }}>
      <label className="block">Reason<select name="reason" required className={vehicle ? "mt-1 block min-h-11 w-full rounded-lg border border-[#d6e6f7] bg-white px-2" : "ml-2 rounded border bg-white p-2"}>
        <option value="">Choose a reason</option>{Object.entries(reportReasons).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label className="block">Note (optional)<textarea name="note" maxLength={300} rows={2} className="block w-full rounded border p-2"/></label>
      <button disabled={pending} className="rounded border px-3 py-2 font-medium">{pending ? "Reporting…" : "Send report"}</button>
      {status && <p role="alert" className="text-red-700">{status}</p>}
    </form>
  </details>;
}
