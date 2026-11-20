import { AnimatedReviewList } from "@/components/reviews/AnimatedReviewList";
import Link from "next/link";
import { PageHeading } from "@/components/owner/ui";
import { OwnerReviewReply } from "@/components/reviews/OwnerReviewReply";
import { ReviewContent } from "@/components/reviews/ReviewContent";
import { ReportReview } from "@/components/reviews/ReportReview";
import { getOwnerContext } from "@/lib/owner-context";
import type { Review } from "@/lib/reviews/model";

export const instant = false;
const filters = { reply: "Needs reply", all: "All", reported: "Reported" } as const;
type OwnerReview = Review & { vehicle: string; booking_id: string; reported: boolean };

export default async function OwnerReviews({ searchParams }: { searchParams: Promise<{ filter?: string; page?: string }> }) {
  const { supabase, owner } = await getOwnerContext();
  const params = await searchParams;
  const filter = params.filter && Object.hasOwn(filters, params.filter) ? params.filter as keyof typeof filters : "reply";
  const page = /^[1-9]\d{0,3}$/.test(params.page ?? "") ? Number(params.page) : 1;
  const [reviews, totals] = await Promise.all([
    supabase.rpc("owner_trip_reviews", { p_filter: filter, p_offset: (page - 1) * 20 }),
    supabase.rpc("owner_review_counts").maybeSingle<{ rating_avg: number; rating_count: number; recent: number; unanswered: number }>(),
  ]);
  const now = new Date().getTime();
  const rows = (reviews.data ?? []) as OwnerReview[];
  const summary = totals.data;
  return <>
    <PageHeading title="Trip reviews" description="Read customer feedback and reply publicly."/>
    {summary && <section aria-label="Review summary" className="mb-4 rounded-xl border bg-white p-4 text-sm">
      <p>{summary.rating_count ? `Rating ${Number(summary.rating_avg).toFixed(1)} / 5` : "No ratings yet"} · {summary.rating_count} reviews · {summary.recent} in the last 30 days · {summary.unanswered} to reply</p>
    </section>}
    <nav aria-label="Review filters" className="mb-4 flex flex-wrap gap-2">{Object.entries(filters).map(([key, label]) =>
      <Link href={`?filter=${key}`} key={key} aria-current={key === filter ? "page" : undefined}
        className={`rounded-md border px-3 py-2 text-sm ${key === filter ? "bg-blue-50 font-semibold" : "bg-white"}`}>{label}</Link>)}</nav>
    {reviews.error ? <p role="alert">Could not load reviews. <Link href={`?filter=${filter}`} className="underline">Retry</Link></p>
      : rows.length === 0 ? <p className="rounded-xl border bg-white p-4 text-sm">No reviews match this filter.</p>
      : <AnimatedReviewList className="space-y-3">{rows.slice(0,20).map(row => <li key={row.id} className="rounded-xl border bg-white p-4 text-sm">
        <div className="mb-2 flex flex-wrap justify-between gap-2"><h2 className="break-words font-semibold">{row.vehicle}</h2>
          <Link href={`/owner/bookings#trip-${row.booking_id}`} className="text-blue-800 underline">View booking</Link></div>
        <ReviewContent review={row} owner={owner.business_name}/>
        {(!row.owner_reply_at || Date.parse(row.owner_reply_at) >= now - 7 * 86_400_000) && <OwnerReviewReply id={row.id} reply={row.owner_reply}/>}
        {row.reported ? <p className="mt-2 text-slate-600">Reported</p> : <ReportReview id={row.id}/>}
      </li>)}</AnimatedReviewList>}
    <nav aria-label="Review pages" className="mt-4 flex gap-4 text-sm text-blue-800">
      {page > 1 && <Link href={`?filter=${filter}&page=${page-1}`} className="underline">Newer</Link>}
      {rows.length > 20 && <Link href={`?filter=${filter}&page=${page+1}`} className="underline">Older</Link>}
    </nav>
  </>;
}
