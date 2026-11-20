"use client";

import { useState, useTransition } from "react";
import { reportTripReview } from "@/lib/reviews/actions";
import { reportReasons, reviewErrors } from "@/lib/reviews/model";
import { toastSuccess } from "@/lib/alerts/toast";

export function ReportReview({ id }: { id: string }) {
  const [status, setStatus] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  if (sent) return <p role="status" className="mt-2 text-sm">Report submitted.</p>;
  return <details className="mt-3 text-sm"><summary className="cursor-pointer text-blue-800 underline">Report review</summary>
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
      <label className="block">Reason<select name="reason" required className="ml-2 rounded border bg-white p-2">
        <option value="">Choose a reason</option>{Object.entries(reportReasons).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label className="block">Note (optional)<textarea name="note" maxLength={300} rows={2} className="block w-full rounded border p-2"/></label>
      <button disabled={pending} className="rounded border px-3 py-2 font-medium">{pending ? "Reporting…" : "Send report"}</button>
      {status && <p role="alert" className="text-red-700">{status}</p>}
    </form>
  </details>;
}
