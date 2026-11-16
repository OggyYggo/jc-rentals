export function UploadProgress({ name, percent }: { name: string; percent: number }) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return <div role="progressbar" aria-label={`Uploading ${name}`} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} className="rounded-2xl border border-[#D6E6F7] p-4"><div className="flex justify-between gap-3 text-sm"><span className="truncate">{name}</span><span className="font-semibold text-[#0B63CE]">{value}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#EAF4FF]"><div className="h-full rounded-full bg-[#0B63CE] transition-[width] motion-reduce:transition-none" style={{ width: `${value}%` }} /></div></div>;
}
