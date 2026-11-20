import { stars, tagLabels, type Review } from "@/lib/reviews/model";

export function Rating({ rating }: { rating: number }) {
  return <span role="img" aria-label={`${rating} out of 5 stars`} className="whitespace-nowrap text-amber-700">{stars(rating)}</span>;
}

export function RatingBadge({ average, count }: { average?: number; count?: number }) {
  if ((count ?? 0) < 3 || average == null) return null;
  return <span className="inline-flex items-center gap-1 text-sm font-semibold" aria-label={`${Number(average).toFixed(1)} stars from ${count} reviews`}>
    <span aria-hidden="true" className="text-amber-700">★</span> {Number(average).toFixed(1)} ({count})
  </span>;
}

export function ReviewContent({ review, owner }: { review: Review; owner: string }) {
  return <>
    <p><Rating rating={review.rating}/> <span className="font-medium">{review.reviewer_name}</span> · {review.trip_month}</p>
    {review.owner_rating && <p className="mt-1 text-xs">Owner and service <Rating rating={review.owner_rating}/></p>}
    {review.tags.length > 0 && <ul className="mt-2 flex flex-wrap gap-1.5">{review.tags.map(tag =>
      <li className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-900" key={tag}>{tagLabels[tag]}</li>)}</ul>}
    {review.comment && <p className="mt-2 whitespace-pre-wrap break-words">{review.comment}</p>}
    {review.owner_reply && <div className="mt-3 border-l-2 border-blue-200 pl-3">
      <p className="break-words font-semibold">Reply from {owner}</p><p className="whitespace-pre-wrap break-words">{review.owner_reply}</p>
    </div>}
  </>;
}
