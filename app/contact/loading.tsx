export default function ContactLoading() {
  return <>
    <div className="h-[270px] animate-pulse bg-gradient-to-r from-[#0A3D91] to-[#0B63CE] lg:h-[310px]" />
    <main className="relative z-10 mx-auto -mt-12 grid w-full max-w-[1440px] gap-7 px-5 pb-16 sm:px-8 lg:-mt-16 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-8 lg:px-[140px]" aria-label="Loading contact page">
      <div className="min-h-[620px] animate-pulse rounded-[22px] border border-[#D6E6F7] bg-white shadow-[0_20px_55px_rgba(10,61,145,.09)]" />
      <div className="space-y-5 lg:pt-16">{[106, 106, 146, 146, 106].map((height, index) => <div key={index} style={{ height }} className="animate-pulse rounded-2xl border border-[#D6E6F7] bg-white" />)}</div>
    </main>
  </>;
}
