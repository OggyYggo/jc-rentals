"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CarFront, Search, UserRound } from "lucide-react";

export function SearchForm() {
  const router = useRouter();
  const [today, setToday] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [mode, setMode] = useState<"self_drive" | "with_driver">("self_drive");
  const [error, setError] = useState("");

  useEffect(() => { setToday(new Date().toISOString().slice(0, 10)); }, []);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const currentDate = new Date().toISOString().slice(0, 10);
    if (!start || !end) return setError("Choose pickup and return dates.");
    if (start < currentDate) return setError("Pickup date cannot be in the past.");
    if (end < start) return setError("Return date must be on or after pickup.");
    router.push(`/cars?start=${start}&end=${end}&mode=${mode}`);
  }

  return <form onSubmit={submit} className="relative z-20 mx-auto -mb-16 mt-10 grid w-full max-w-5xl gap-3 rounded-2xl border border-[#D6E6F7] bg-white p-4 text-left shadow-[0_24px_65px_-30px_rgba(10,61,145,.4)] sm:-mb-24 sm:grid-cols-[1fr_1fr_1.2fr] sm:items-end sm:p-5">
    <label className="text-xs font-semibold text-[#0F2342]">Pickup date<div className="mt-2 flex min-h-12 items-center gap-2 rounded-xl border border-[#D6E6F7] px-3"><CalendarDays size={17} className="shrink-0 text-[#0B63CE]"/><input aria-label="Pickup date" required type="date" min={today} value={start} onChange={event=>{setStart(event.target.value);setError("");}} className="h-11 w-full min-w-0 bg-transparent text-sm text-[#0F2342] outline-none"/></div></label>
    <label className="text-xs font-semibold text-[#0F2342]">Return date<div className="mt-2 flex min-h-12 items-center gap-2 rounded-xl border border-[#D6E6F7] px-3"><CalendarDays size={17} className="shrink-0 text-[#0B63CE]"/><input aria-label="Return date" required type="date" min={start || today} value={end} onChange={event=>{setEnd(event.target.value);setError("");}} className="h-11 w-full min-w-0 bg-transparent text-sm text-[#0F2342] outline-none"/></div></label>
    <div><span className="mb-2 block text-xs font-semibold text-[#0F2342]">How would you like to travel?</span><div className="mb-2 grid grid-cols-2 rounded-full bg-[#EAF4FF] p-1">{([["self_drive","Self-drive",CarFront],["with_driver","With driver",UserRound]] as const).map(([value,label,Icon])=><button type="button" key={value} aria-pressed={mode===value} onClick={()=>setMode(value)} className={`flex min-h-10 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors ${mode===value?"bg-[#0B63CE] text-white shadow-sm":"text-[#0A3D91] hover:bg-white"}`}><Icon size={15}/>{label}</button>)}</div><button className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0B63CE] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#0A3D91]"><Search size={17}/>Find cars</button></div>
    {error&&<p role="alert" className="text-xs font-medium text-[#D64545] sm:col-span-3">{error}</p>}
  </form>;
}
