"use client";

import { useEffect, useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, CarFront, MapPin, Search, UserRound } from "lucide-react";
import { Spinner } from "@/components/loading/Spinner";
import { carsUrl } from "@/lib/cars/searchParams";

const LOCATIONS = ["Tagbilaran", "Panglao", "Loboc", "Carmen", "Tubigon", "Anda"];

function manilaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function SearchForm() {
  const router = useRouter();
  const pathname = usePathname();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [location, setLocation] = useState("");
  const [mode, setMode] = useState<"self" | "driver">("self");
  const [vehicle, setVehicle] = useState<"car" | "motorcycle">("car");
  const [errors, setErrors] = useState<{ from?: string; to?: string }>({});
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    setSearching(false);
  }, [pathname]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: { from?: string; to?: string } = {};
    if (start && start < manilaToday()) nextErrors.from = "Pickup date cannot be in the past.";
    if (Boolean(start) !== Boolean(end)) {
      if (!start) nextErrors.from = "Choose a pickup date.";
      if (!end) nextErrors.to = "Choose a return date.";
    }
    if (start && end && end <= start) nextErrors.to = "Return date must be after pickup.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSearching(true);
    const search = { vehicle, mode: vehicle === "motorcycle" ? "self" as const : mode, from: start || undefined, to: end || undefined, pickup: location.trim() || undefined };
    try { window.sessionStorage.setItem("kuyog-car-search", JSON.stringify(search)); } catch { /* Storage is optional. */ }
    router.push(carsUrl(search));
  }

  return <form onSubmit={submit} aria-busy={searching} className="relative z-20 mx-auto -mb-[72px] mt-10 w-full max-w-[1040px] rounded-[20px] border border-[#D6E6F7] bg-white p-4 text-left shadow-[0_24px_65px_-30px_rgba(10,61,145,.4)] sm:p-6 lg:-mb-[62px] lg:rounded-3xl">
    <div className="mb-4 flex flex-wrap gap-3"><div className="flex w-fit rounded-full bg-[#EAF4FF] p-1" role="group" aria-label="Vehicle type">{([ ["car", "Car"], ["motorcycle", "Motorcycle"] ] as const).map(([value,label])=><button key={value} type="button" aria-pressed={vehicle===value} onClick={()=>setVehicle(value)} className={`h-10 rounded-full px-4 text-sm font-semibold ${vehicle===value?"bg-[#0B63CE] text-white":"text-[#0A3D91]"}`}>{label}</button>)}</div>{vehicle === "car" && <div className="flex w-fit rounded-full bg-[#EAF4FF] p-1" role="group" aria-label="Travel mode">
      {([["self", "Self-drive", CarFront], ["driver", "With driver", UserRound]] as const).map(([value, label, Icon]) => <button type="button" key={value} aria-pressed={mode === value} onClick={() => setMode(value)} className={`inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${mode === value ? "bg-[#0B63CE] text-white shadow-sm" : "text-[#0A3D91] hover:bg-white"}`}><Icon size={16} aria-hidden="true"/>{label}</button>)}
    </div>}</div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.2fr_auto] lg:items-end">
      <label className="text-xs font-semibold text-[#0F2342]">Pickup date<div className="mt-2 flex min-h-12 items-center gap-2 rounded-xl border border-[#D6E6F7] px-3"><CalendarDays size={17} className="shrink-0 text-[#0B63CE]"/><input id="pickup-date" aria-label="Pickup date" type="date" onFocus={event => { event.currentTarget.min = manilaToday(); }} value={start} onChange={event => { setStart(event.target.value); setErrors({}); }} className="h-11 w-full min-w-0 bg-transparent text-sm text-[#0F2342] outline-none"/></div>{errors.from && <span className="mt-1 block text-[11px] font-medium text-[#D64545]">{errors.from}</span>}</label>
      <label className="text-xs font-semibold text-[#0F2342]">Return date<div className="mt-2 flex min-h-12 items-center gap-2 rounded-xl border border-[#D6E6F7] px-3"><CalendarDays size={17} className="shrink-0 text-[#0B63CE]"/><input aria-label="Return date" type="date" min={start || undefined} onFocus={event => { event.currentTarget.min = start || manilaToday(); }} value={end} onChange={event => { setEnd(event.target.value); setErrors({}); }} className="h-11 w-full min-w-0 bg-transparent text-sm text-[#0F2342] outline-none"/></div>{errors.to && <span className="mt-1 block text-[11px] font-medium text-[#D64545]">{errors.to}</span>}</label>
      <label className="text-xs font-semibold text-[#0F2342]">Pickup location<div className="mt-2 flex min-h-12 items-center gap-2 rounded-xl border border-[#D6E6F7] px-3"><MapPin size={17} className="shrink-0 text-[#0B63CE]"/><input aria-label="Pickup location" list="bohol-pickup-locations" placeholder="Airport, hotel, or town" value={location} onChange={event => setLocation(event.target.value)} className="h-11 w-full min-w-0 bg-transparent text-sm text-[#0F2342] outline-none placeholder:text-[#8291a5]"/><datalist id="bohol-pickup-locations">{LOCATIONS.map(place => <option key={place} value={place}/>)}</datalist></div></label>
      <button disabled={searching} aria-busy={searching} className="flex h-12 min-w-[150px] items-center justify-center gap-2 rounded-full bg-[#0B63CE] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#0A3D91] disabled:opacity-70">{searching ? <><Spinner className="size-4 text-white" label="Searching"/>Searching…</> : <><Search size={17} aria-hidden="true"/>Search {vehicle === "motorcycle" ? "motorcycles" : "vehicles"}</>}</button>
    </div>
  </form>;
}
