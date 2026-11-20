export default function ReviewsLoading() {
  return <div role="status" aria-busy="true" className="space-y-3">
    <span className="sr-only">Loading reviews</span>
    <div className="h-9 w-40 rounded-md bg-slate-200"/>
    {[0,1,2].map(row => <div key={row} className="h-28 rounded-xl border bg-white motion-safe:animate-pulse"/>)}
  </div>;
}
