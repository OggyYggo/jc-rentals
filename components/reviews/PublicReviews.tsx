"use client";

import { AnimatedReviewList } from "@/components/reviews/AnimatedReviewList";
import { useState, useTransition } from "react";
import { loadVehicleReviews } from "@/app/cars/[id]/review-list-actions";
import { type Review, tagLabels } from "@/lib/reviews/model";
import type { ReviewOrder } from "@/lib/reviews/public";
import { ChevronDown, ListFilter, LoaderCircle, MessageCircle, CornerDownRight, Star } from "lucide-react";
import { Rating } from "./ReviewContent";
import { ReportReview } from "./ReportReview";

type Props = {
  carId: string; owner: string; count: number; average: number; canReport: boolean;
  distribution: { rating: number; total: number }[]; tags: { tag: keyof typeof tagLabels; total: number }[];
  initial: { rows: Review[]; more: boolean } | null;
};

export function PublicReviews({ carId, owner, count, average, canReport, distribution, tags, initial }: Props) {
  const [rows, setRows] = useState(initial?.rows ?? []);
  const [more, setMore] = useState(initial?.more ?? false);
  const [error, setError] = useState(initial ? "" : "Could not load reviews.");
  const [order, setOrder] = useState<ReviewOrder>("newest");
  const [pending, start] = useTransition();
  function load(next: ReviewOrder, append: boolean) {
    start(async () => {
      setError("");
      try {
        const last = append ? rows.at(-1) : undefined;
        const cursor = last && { id: last.id, created_at: last.created_at, rating: last.rating };
        const result = await loadVehicleReviews({ carId, order: next, cursor });
        if (!result) throw new Error();
        setRows(current => append ? [...new Map([...current, ...result.rows].map(row => [row.id, row])).values()] : result.rows);
        setMore(result.more);
        setOrder(next);
      } catch {
        setError("Could not load reviews. Try again.");
      }
    });
  }

  return <section id="reviews" aria-labelledby="vehicle-reviews-heading"
    className="min-w-0 scroll-mt-24 overflow-hidden rounded-3xl border border-[#d6e6f7] bg-white">
    <div className="border-b border-[#e2ecf8] bg-[#f3f8ff] p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="vehicle-reviews-heading" className="text-xl font-bold tracking-tight text-[#0F2342] sm:text-2xl">Reviews</h2>
        {count > 0 && <p className="text-sm font-medium text-[#405672]">{count} {count === 1 ? "review" : "reviews"}</p>}
      </div>

      {count > 0 && <div className="mt-4 grid items-center gap-4 min-[480px]:grid-cols-[minmax(0,0.75fr)_minmax(0,1fr)] sm:gap-5">
        <div className="min-w-0">
          {count >= 3 ? <>
            <div className="flex items-baseline gap-1.5 tabular-nums">
              <p className="text-5xl font-bold leading-none tracking-tight text-[#0F2342]">{Number(average).toFixed(1)}</p>
              <span className="text-sm font-medium text-[#405672]">out of 5</span>
            </div>
            <div aria-hidden="true" className="mt-1.5"><Rating rating={Math.round(average)} /></div>
          </> : <p className="text-base font-semibold text-[#243e64]">New listing</p>}
        </div>
        <ul className="space-y-1.5" aria-label="Rating breakdown">
          {[5, 4, 3, 2, 1].map(rating => {
            const total = Number(distribution.find(bucket => Number(bucket.rating) === rating)?.total ?? 0);
            const max = Math.max(count, total);
            return <li key={rating} className="grid grid-cols-[1.75rem_minmax(0,1fr)_2rem] items-center gap-2 text-xs font-medium tabular-nums text-[#405672]">
              <span aria-hidden="true" className="flex items-center gap-0.5">{rating}<Star size={11} className="fill-amber-500 text-amber-600" /></span>
              <div role="meter" aria-label={`${rating}-star reviews`} aria-valuemin={0} aria-valuemax={max} aria-valuenow={total} aria-valuetext={`${total} of ${max} reviews`}
                className="h-1.5 overflow-hidden rounded-full bg-[#dbe7f6]">
                <div className="h-full rounded-full bg-[#155cbc]" style={{ width: `${total / max * 100}%` }} />
              </div>
              <span aria-hidden="true" className="text-right">{total}</span>
            </li>;
          })}
        </ul>
      </div>}
      {tags.length > 0 && <div className="mt-4 border-t border-[#dce8f7] pt-3">
        <p className="mb-2 text-xs font-semibold text-[#405672]">Frequently mentioned</p>
        <ul className="flex flex-wrap gap-1.5">{tags.map(({ tag, total }) => <li key={tag} className="inline-flex items-center gap-1.5 rounded-full border border-[#dce8f7] bg-white px-2.5 py-1 text-xs font-medium text-[#28496f]">
          {tagLabels[tag]} <span className="tabular-nums text-[#536b88]">{total}</span>
        </li>)}</ul>
      </div>}
    </div>

    <div className="space-y-3 p-4 sm:p-6">
      {count > 0 && <label className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-[#243e64]">
        <span className="inline-flex items-center gap-1.5"><ListFilter size={16} aria-hidden="true" />Sort reviews</span>
        <span className="relative">
          <select value={order} disabled={pending} onChange={event => load(event.target.value as ReviewOrder, false)}
            className="min-h-11 min-w-[126px] appearance-none rounded-xl border border-[#d6e6f7] bg-white pl-3 pr-8 text-sm text-[#243e64] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] disabled:opacity-60 forced-colors:appearance-auto forced-colors:pr-2">
            <option value="newest">Newest</option><option value="highest">Highest rated</option><option value="lowest">Lowest rated</option>
          </select>
          <ChevronDown size={15} aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 forced-colors:hidden" />
        </span>
      </label>}
      {!rows.length && !error && <div className="rounded-2xl border border-dashed border-[#d6e6f7] px-4 py-6 text-center">
        <div className="mx-auto grid size-10 place-items-center rounded-xl bg-[#eaf4ff] text-[#0A3D91]"><MessageCircle size={20} aria-hidden="true" /></div>
        <p className="mt-2 text-sm font-semibold text-[#243e64]">No reviews yet</p>
        <p className="mt-1 text-sm text-[#405672]">Reviews appear after completed trips.</p>
      </div>}
      <AnimatedReviewList className="space-y-3" busy={pending}>
        {rows.map(review => <li key={review.id} className="rounded-2xl border border-[#e0eaf7] p-3.5 sm:p-4">
          <VehicleReviewCard review={review} owner={owner} />
          {canReport && <ReportReview id={review.id} variant="vehicle" />}
        </li>)}
      </AnimatedReviewList>
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
        {error} <button type="button" className="min-h-9 font-semibold underline" disabled={pending} onClick={() => load(order, false)}>Retry</button>
      </p>}
      {more && <button type="button" disabled={pending} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#d6e6f7] bg-[#f7fbff] px-4 text-sm font-semibold text-[#0A3D91] hover:bg-[#eaf4ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE] disabled:opacity-60" onClick={() => load(order, true)}>
        {pending ? <LoaderCircle size={16} aria-hidden="true" className="motion-safe:animate-spin" /> : <ChevronDown size={16} aria-hidden="true" />}
        {pending ? "Loading…" : "Load more reviews"}
      </button>}
    </div>
  </section>;
}

function VehicleReviewCard({ review, owner }: { review: Review; owner: string }) {
  const reviewer = review.reviewer_name.trim() || "Renter";
  const initials = reviewer.split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join("").toLocaleUpperCase();
  return <>
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-[#eaf4ff] text-xs font-bold text-[#0A3D91]">{initials}</span>
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-[#0F2342]">{reviewer}</p>
          <p className="text-xs text-[#526982]">Trip in {review.trip_month}</p>
        </div>
      </div>
      <div className="rounded-full bg-amber-50 px-2.5 py-1 text-sm leading-5"><Rating rating={review.rating} /></div>
    </div>
    {review.comment && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[#324861]">{review.comment}</p>}
    {(review.owner_rating || review.tags.length > 0) && <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      {review.owner_rating && <p className="inline-flex flex-wrap items-center gap-1.5 text-xs text-[#405672]">Owner and service <Rating rating={review.owner_rating} /></p>}
      {review.tags.length > 0 && <ul className="flex flex-wrap gap-1.5">{review.tags.map(tag =>
        <li className="rounded-md bg-[#edf5ff] px-2 py-1 text-xs font-medium text-[#28496f]" key={tag}>{tagLabels[tag]}</li>)}</ul>}
    </div>}
    {review.owner_reply && <div className="mt-3 rounded-xl bg-[#f3f8ff] px-3 py-2.5">
      <p className="flex items-start gap-2 break-words text-xs font-semibold text-[#243e64]"><CornerDownRight size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-[#0A3D91]" /><span className="min-w-0">Reply from {owner}</span></p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[#405672]">{review.owner_reply}</p>
    </div>}
  </>;
}
