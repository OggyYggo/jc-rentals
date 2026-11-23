"use client";

import { useEffect, useId, useRef, useState } from "react";
import { saveTripReview } from "@/app/account/bookings/review-actions";
import { reviewErrors, tagLabels, type MyReview, type ReviewFields } from "@/lib/reviews/model";
import { toastSuccess } from "@/lib/alerts/toast";
import { SubmitButton } from "@/components/loading/SubmitButton";

const labels = ["Poor", "Fair", "Good", "Very good", "Excellent"];
function StarInput({ label, value, change, optional }: { label: string; value: number; change: (rating: number) => void; optional?: boolean }) {
  const id = useId();
  return <fieldset>
    <legend>{label}{optional && " (optional)"}</legend>
    <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label={label}>
      {labels.map((quality, index) => <label key={quality} className="relative grid size-11 cursor-pointer place-items-center rounded-md text-2xl focus-within:outline-2 focus-within:outline-blue-700">
        <input className="absolute inset-0 m-0 size-full cursor-pointer opacity-0" type="radio" name={id} checked={value === index + 1} onChange={() => change(index + 1)} aria-label={`${index + 1} stars, ${quality}`}/>
        <span aria-hidden="true" className={index < value ? "text-amber-700" : "text-slate-500"}>{index < value ? "★" : "☆"}</span>
      </label>)}
      {optional && value > 0 && <button type="button" className="px-2 py-2 underline" onClick={() => change(0)}>Clear</button>}
    </div>
    {!optional && value > 0 && <p className="mt-1 font-semibold text-[#0A3D91] md:hidden" aria-live="polite">{labels[value - 1]}</p>}
  </fieldset>;
}

export function ReviewDialog({ booking, review, close, saved, trip }: {
  booking: string; review?: MyReview; close: () => void; saved: () => void;
  trip?: { car: { brand: string; model: string } | null; start_date: string; end_date: string };
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const sending = useRef(false);
  const [rating, setRating] = useState(review?.rating ?? 0);
  const [ownerRating, setOwnerRating] = useState(review?.owner_rating ?? 0);
  const [comment, setComment] = useState(review?.comment ?? "");
  const [tags, setTags] = useState<ReviewFields["tags"]>(review?.tags ?? []);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);

  async function submit() {
    if (sending.current || !rating) return;
    sending.current = true;
    setPending(true);
    setError("");
    try {
      const result = await saveTripReview({ id: review?.id ?? booking, edit: Boolean(review), rating,
        owner_rating: ownerRating || null, comment, tags });
      if (result.error) {
        setError(reviewErrors[result.error] ?? reviewErrors.REVIEW_UNAVAILABLE);
        return;
      }
      setDone(true);
      saved();
      void toastSuccess(review ? "Review updated" : "Review submitted");
    } catch {
      setError(reviewErrors.REVIEW_UNAVAILABLE);
    } finally {
      sending.current = false;
      setPending(false);
    }
  }

  return <dialog ref={dialog} aria-labelledby="trip-review-title" onCancel={event => { event.preventDefault(); if (!pending) close(); }}
    className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[90dvh] w-full max-w-none overflow-y-auto rounded-t-2xl bg-white p-5 text-slate-900 backdrop:bg-slate-950/50 sm:inset-0 sm:m-auto sm:max-w-lg sm:rounded-2xl">
    <div className="flex items-start justify-between gap-3"><h2 id="trip-review-title" className="text-xl font-semibold">{done ? "Thank you for sharing your experience" : review ? "Edit your review" : "Rate your trip"}</h2>
      <button type="button" onClick={close} disabled={pending} className="rounded border px-3 py-2 text-sm max-md:min-h-11">Close</button></div>
    {!done && <form className="mt-4 space-y-4 text-sm" onSubmit={event => { event.preventDefault(); void submit(); }}>
      {trip && <div className="rounded-2xl border border-[#D6E6F7] bg-[#F3F9FF] p-4 md:hidden">
        <p className="font-heading font-semibold">{trip.car ? `${trip.car.brand} ${trip.car.model}` : "Your vehicle"}</p>
        <p className="mt-1 text-[#5B6F89]">{trip.start_date} to {trip.end_date}</p>
      </div>}
      <StarInput label="Vehicle rating" value={rating} change={setRating}/>
      <StarInput label="Owner and service rating" value={ownerRating} change={setOwnerRating} optional/>
      <fieldset><legend>Quick tags (up to five)</legend><div className="mt-2 flex flex-wrap gap-2">
        {Object.entries(tagLabels).map(([key, label]) => {
          const tag = key as keyof typeof tagLabels;
          return <button key={tag} type="button" aria-pressed={tags.includes(tag)} disabled={!tags.includes(tag) && tags.length >= 5}
            onClick={() => setTags(tags.includes(tag) ? tags.filter(item => item !== tag) : [...tags, tag])}
            className={`rounded-full border px-3 py-2 disabled:opacity-50 max-md:min-h-11 ${tags.includes(tag) ? "bg-blue-50 text-blue-800" : ""}`}>
            {tag === "clean" || tag === "smooth_pickup" ? <><span className="md:hidden">{tag === "clean" ? "Clean car" : "Easy pickup"}</span><span className="hidden md:inline">{label}</span></> : label}
          </button>;
        })}
      </div></fieldset>
      <label className="block">Comment (optional)<textarea value={comment} onChange={event => setComment(event.target.value)} maxLength={1000}
        aria-describedby="trip-review-help" rows={4} className="mt-1 block w-full rounded-lg border p-2"/></label>
      <p id="trip-review-help" className="text-slate-600">Don’t share phone numbers or links. <span aria-live="polite">{[...comment].length}/1000</span></p>
      {error && <p role="alert" className="text-red-800">{error}</p>}
      <SubmitButton unstyled className="rounded-lg bg-blue-800 px-4 py-3 font-semibold text-white disabled:opacity-55 max-md:h-[52px] max-md:w-full max-md:rounded-full max-md:bg-[#0A47B1]" busy={pending} pendingText="Saving…" disabled={!rating}>
        {review ? "Save changes" : "Submit review"}</SubmitButton>
      {!review && <p className="text-center text-xs text-[#5B6F89] md:hidden">You can edit your review once within 7 days. Owners can reply once.</p>}
    </form>}
    {done && <p role="status" className="mt-4 text-sm">Your review was saved.</p>}
  </dialog>;
}
