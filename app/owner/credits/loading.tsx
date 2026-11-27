export default function CreditsLoading() {
  return <div className="space-y-5 lg:hidden" role="status">
    <span className="sr-only">Loading credits</span>
    <div aria-hidden className="space-y-3 motion-safe:animate-pulse">
      <div className="h-14 w-2/3 rounded-xl bg-[#E3EEF9]" />
      <div className="h-48 rounded-2xl bg-[#D6E6F7]" />
      <div className="h-11 rounded-xl bg-[#E3EEF9]" />
      {[0, 1, 2].map(row => <div key={row} className="h-16 rounded-xl bg-[#E3EEF9]" />)}
    </div>
  </div>;
}
