export default function PickupPassLoading() {
  return <main role="status" className="mx-auto w-full max-w-md px-4 py-6">
    <span className="sr-only">Loading your pickup pass</span>
    <div aria-hidden="true" className="motion-safe:animate-pulse">
      <div className="h-6 w-32 rounded bg-slate-200" />
      <div className="mt-5 flex flex-col items-center gap-5 rounded-[22px] border-2 border-blue-100 bg-white p-5">
        <div className="h-6 w-32 rounded-full bg-blue-100" />
        <div className="aspect-square w-full max-w-60 rounded-lg bg-slate-100" />
        <div className="h-8 w-36 rounded bg-slate-200" />
      </div>
    </div>
  </main>;
}
