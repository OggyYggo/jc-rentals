"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { replyToTripReview } from "@/lib/reviews/actions";
import { reviewErrors } from "@/lib/reviews/model";
import { toastSuccess } from "@/lib/alerts/toast";

export function OwnerReviewReply({ id, reply }: { id: string; reply: string | null }) {
  const [value, setValue] = useState(reply ?? "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return <details className="mt-3"><summary className="cursor-pointer text-blue-800 underline">{reply ? "Edit reply" : "Reply"}</summary>
    <form className="mt-2 space-y-2" onSubmit={event => {
      event.preventDefault();
      start(async () => {
        try {
          const result = await replyToTripReview(id, value);
          if (result.error) return setError(reviewErrors[result.error] ?? reviewErrors.REVIEW_UNAVAILABLE);
          setError("");
          router.refresh();
          void toastSuccess("Reply saved");
        } catch {
          setError(reviewErrors.REVIEW_UNAVAILABLE);
        }
      });
    }}>
      <label className="block">Public reply<textarea value={value} onChange={event => setValue(event.target.value)}
        maxLength={500} rows={3} className="block w-full rounded-md border p-2"/></label>
      <p className="text-xs text-slate-600">{[...value].length}/500</p>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <button disabled={pending || !value.trim()} className="rounded-md bg-blue-800 px-3 py-2 text-white disabled:opacity-50">
        {pending ? "Saving…" : "Save reply"}</button>
    </form>
  </details>;
}
