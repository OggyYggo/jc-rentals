"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CarFront, MapPin, Search, UserRound } from "lucide-react";
import { Spinner } from "@/components/loading/Spinner";

export function SearchForm() {
  const router = useRouter();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [location, setLocation] = useState("");
  const [mode, setMode] = useState<"self_drive" | "with_driver">("self_drive");
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const currentDate = new Date().toISOString().slice(0, 10);
    if (!start || !end) return setError("Choose pickup and return dates.");
    if (start < currentDate) return setError("Pickup date cannot be in the past.");
    if (end < start) return setError("Return date must be on or after pickup.");
    setSearching(true);
    const query = new URLSearchParams({ start, end, mode });
    if (location.trim()) query.set("pickup", location.trim());
    router.push(`/cars?${query.toString()}`);
  }

  return <form onSubmit={submit} aria-busy={searching} className="relative z-20 mx-auto -mb-[72px] mt-10 w-full max-w-[1040px] rounded-[20px] border border-[#D6E6F7] bg-white p-4 text-left shadow-[0_24px_65px_-30px_rgba(10,61,145,.4)] sm:p-6 lg:-mb-[62px] lg:rounded-3xl">
    <div className="mb-4 flex w-fit rounded-full bg-[#EAF4FF] p-1" aria-label="Travel mode">
      {([["self_drive", "Self-drive", CarFront], ["with_driver", "With driver", UserRound]] as const).map(([value, label, Icon]) => <button type="button" key={value} aria-pressed={mode === value} onClick={() => setMode(value)} className={`inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${mode === value ? "bg-[#0B63CE] text-white shadow-sm" : "text-[#0A3D91] hover:bg-white"}`}><Icon size={16}/>{label}</button>)}
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.2fr_auto] lg:items-end">
      <label className="text-xs font-semibold text-[#0F2342]">Pickup date<div className="mt-2 flex min-h-12 items-center gap-2 rounded-xl border border-[#D6E6F7] px-3"><CalendarDays size={17} className="shrink-0 text-[#0B63CE]"/><input aria-label="Pickup date" required type="date" onFocus={event => { event.currentTarget.min = new Date().toISOString().slice(0, 10); }} value={start} onChange={event => { setStart(event.target.value); setError(""); }} className="h-11 w-full min-w-0 bg-transparent text-sm text-[#0F2342] outline-none"/></div></label>
      <label className="text-xs font-semibold text-[#0F2342]">Return date<div className="mt-2 flex min-h-12 items-center gap-2 rounded-xl border border-[#D6E6F7] px-3"><CalendarDays size={17} className="shrink-0 text-[#0B63CE]"/><input aria-label="Return date" required type="date" min={start || undefined} value={end} onChange={event => { setEnd(event.target.value); setError(""); }} className="h-11 w-full min-w-0 bg-transparent text-sm text-[#0F2342] outline-none"/></div></label>
      <label className="text-xs font-semibold text-[#0F2342]">Pickup location<div className="mt-2 flex min-h-12 items-center gap-2 rounded-xl border border-[#D6E6F7] px-3"><MapPin size={17} className="shrink-0 text-[#0B63CE]"/><input aria-label="Pickup location" placeholder="Airport, hotel, or town" value={location} onChange={event => setLocation(event.target.value)} className="h-11 w-full min-w-0 bg-transparent text-sm text-[#0F2342] outline-none placeholder:text-[#8291a5]"/></div></label>
      <button disabled={searching} aria-busy={searching} className="flex h-12 min-w-[150px] items-center justify-center gap-2 rounded-full bg-[#0B63CE] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#0A3D91] disabled:opacity-70">{searching ? <><Spinner className="size-4 text-white" label="Searching"/>Searching…</> : <><Search size={17}/>Search cars</>}</button>
    </div>
    {error && <p role="alert" className="mt-3 text-xs font-medium text-[#D64545]">{error}</p>}
  </form>;
}
