export default function Loading() {
  return <main aria-busy="true" aria-label="Loading vehicles" className="min-h-screen bg-[#F3F9FF] py-4 md:py-10">
    <div className="mx-auto w-full max-w-[1280px] space-y-3 px-5 sm:px-8 md:space-y-4 lg:px-12 motion-safe:animate-pulse">
      <div className="h-20 max-w-lg rounded-xl bg-[#D6E6F7]"/>
      <div className="h-14 rounded-xl bg-white md:h-24"/>
      <div className="grid gap-5 md:grid-cols-[240px_minmax(0,1fr)] lg:grid-cols-[272px_minmax(0,1fr)]">
        <div className="hidden h-96 rounded-2xl bg-white md:block"/>
        <div className="space-y-3">
          <div className="h-14 max-w-sm rounded-xl bg-[#D6E6F7]"/>
          <div className="h-11 rounded-xl bg-[#EAF4FF]"/>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => <div key={index} className={`overflow-hidden rounded-2xl border border-[#D6E6F7] bg-white ${index > 1 ? "hidden md:block" : ""}`}>
              <div className="aspect-[16/10] bg-[#D6E6F7]"/><div className="h-28"/>
            </div>)}
          </div>
        </div>
      </div>
    </div>
  </main>;
}
