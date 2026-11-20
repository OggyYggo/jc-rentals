"use client";

import { AnimatedReviewList } from "@/components/reviews/AnimatedReviewList";
import { useState, useTransition } from "react";
import { loadVehicleReviews } from "@/app/cars/[id]/review-list-actions";
import { type Review, tagLabels } from "@/lib/reviews/model";
import type { ReviewOrder } from "@/lib/reviews/public";
import { Rating, RatingBadge, ReviewContent } from "./ReviewContent";
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

  return <section id="reviews" className="min-w-0 scroll-mt-24 space-y-4 rounded-2xl border border-blue-100 bg-white p-4 sm:p-5">
    <h2 className="text-lg font-semibold">Reviews</h2>
    {count < 3 ? <p className="text-sm text-slate-600">New listing · {count} {count === 1 ? "review" : "reviews"}</p>
      : <div className="space-y-2"><p className="text-2xl"><RatingBadge average={average} count={count}/></p><Rating rating={Math.round(average)}/></div>}
    {count > 0 && <ul className="space-y-1 text-xs">{[5, 4, 3, 2, 1].map(rating => {
      const total = Number(distribution.find(bucket => bucket.rating === rating)?.total ?? 0);
      return <li key={rating} className="grid grid-cols-[2rem_1fr_2rem] items-center gap-2">{rating} ★
        <meter min={0} max={Math.max(count, total)} value={total} aria-label={`${rating}-star reviews`} className="w-full"/>
        <span className="text-right">{total}</span></li>;
    })}</ul>}
    {tags.length > 0 && <ul className="flex flex-wrap gap-2">{tags.map(({ tag, total }) =>
      <li key={tag} className="rounded-full bg-blue-50 px-2 py-1 text-xs">{tagLabels[tag]} · {total}</li>)}</ul>}
    {count > 0 && <label className="block text-sm font-medium">Sort reviews
      <select value={order} disabled={pending} onChange={event => load(event.target.value as ReviewOrder, false)} className="ml-2 rounded border bg-white p-2">
        <option value="newest">Newest</option><option value="highest">Highest</option><option value="lowest">Lowest</option>
      </select></label>}
    {!rows.length && !error && <p className="text-sm text-slate-600">No reviews yet. Reviews appear after completed trips.</p>}
    <AnimatedReviewList className="divide-y" busy={pending}>{rows.map(row => <li key={row.id} className="py-3 text-sm">
      <ReviewContent review={row} owner={owner}/>
      {canReport && <ReportReview id={row.id}/>}
    </li>)}</AnimatedReviewList>
    {error && <p className="text-sm text-red-700" role="alert">{error} <button type="button" className="underline" onClick={() => load(order, false)}>Retry</button></p>}
    {more && <button type="button" disabled={pending} className="rounded border px-4 py-2 text-sm font-medium" onClick={() => load(order, true)}>
      {pending ? "Loading…" : "Load more"}</button>}
  </section>;
}
