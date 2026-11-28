export default function PaymentLoading() {
  return <section aria-busy="true" className="space-y-4 py-2">
    <p role="status" className="sr-only">Loading payment</p>
    <div aria-hidden="true" className="h-9 w-48 rounded-full bg-[#EAF4FF] motion-safe:animate-pulse" />
    <div aria-hidden="true" className="grid gap-4 motion-safe:animate-pulse md:grid-cols-2">
      <div className="space-y-4">
        <div className="h-40 rounded-2xl bg-[#D6E6F7]" />
        <div className="h-64 rounded-2xl border border-[#D6E6F7] bg-white" />
      </div>
      <div className="hidden h-96 rounded-2xl border border-[#D6E6F7] bg-white md:block" />
    </div>
  </section>;
}
