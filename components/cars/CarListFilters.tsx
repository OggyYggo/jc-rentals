"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ComponentProps, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { carsUrl, type CarSearch } from "@/lib/cars/searchParams";

const sorts = {
  recommended: "Recommended",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
  rating: "Highest rated",
};
const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B63CE]";
const field = `min-h-11 w-full min-w-0 rounded-xl border border-[#D6E6F7] bg-white px-2.5 text-sm ${focus}`;
const primary = `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-transparent bg-[#0B63CE] px-4 text-sm font-semibold text-white hover:bg-[#0A3D91] ${focus}`;
const chip = `inline-flex min-h-11 items-center rounded-xl border border-[#D6E6F7] bg-white px-3 text-sm font-semibold text-[#0A3D91] hover:bg-[#F3F9FF] aria-pressed:border-[#0B63CE] aria-pressed:bg-[#EAF4FF] ${focus}`;

function SortOptions() {
  return Object.entries(sorts).map(([value, label]) => <option key={value} value={value}>{label}</option>);
}

function FilterSelect({ children, ...props }: Omit<ComponentProps<"select">, "className">) {
  return <span className="relative block min-w-0">
    <select {...props} className={`${field} block cursor-pointer appearance-none pl-3 pr-9 text-[#0F2342] hover:border-[#0B63CE] forced-colors:appearance-auto`}>
      {children}
    </select>
    <ChevronDown aria-hidden size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#5B6F89] forced-colors:hidden"/>
  </span>;
}

export function CarSort({ search }: { search: CarSearch }) {
  const router = useRouter();
  return <label className="flex shrink-0 items-center gap-2 text-sm font-semibold">
    <span>Sort<span className="sr-only"> vehicles</span></span>
    <FilterSelect value={search.sort ?? "recommended"}
      onChange={event => router.replace(carsUrl({ ...search, sort: event.target.value as CarSearch["sort"] }), { scroll: false })}>
      <SortOptions/>
    </FilterSelect>
  </label>;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" })
    .format(new Date(value + "T00:00:00+08:00"));
}

export function CarSearchBar({ search, activeCount }: { search: CarSearch; activeCount: number }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const dateInput = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [session, setSession] = useState(0);
  const searchKey = JSON.stringify(search);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 48rem)");
    const closeOnDesktop = () => { if (desktop.matches) dialog.current?.close(); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  function open(button: HTMLButtonElement, dates: boolean) {
    trigger.current = button;
    dialog.current?.showModal();
    if (dates) dateInput.current?.focus();
  }

  function trapFocus(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button, a[href], select, input"))
      .filter(element => !element.matches(":disabled") && element.getClientRects().length);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return <>
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 md:hidden">
      <button type="button" aria-haspopup="dialog" onClick={event => open(event.currentTarget, true)} className={`flex min-h-14 min-w-0 items-center gap-3 rounded-xl border border-[#D6E6F7] bg-white px-3 text-left ${focus}`}>
        <CalendarDays size={20} className="shrink-0 text-[#0B63CE]" aria-hidden/>
        <span className="min-w-0"><span className="block text-[13px] text-[#5B6F89]">Pickup to return</span><span className="block break-words text-sm font-semibold">{search.from && search.to ? `${dateLabel(search.from)} – ${dateLabel(search.to)}` : "Choose dates"}{search.pickup && ` · ${search.pickup}`}</span></span>
      </button>
      <button type="button" aria-haspopup="dialog" aria-label={`Filters, ${activeCount} active`} onClick={event => open(event.currentTarget, false)} className={`relative flex min-w-16 flex-col items-center justify-center gap-0.5 rounded-xl border border-[#D6E6F7] bg-white px-2 py-1.5 text-[#0A3D91] hover:border-[#0B63CE] hover:bg-[#EAF4FF] ${focus}`}>
        <SlidersHorizontal size={19} aria-hidden/><span className="text-xs font-semibold">Filters</span>{activeCount > 0 && <span aria-hidden className="absolute right-0.5 top-0.5 rounded-full bg-[#D92D20] px-1.5 text-xs font-semibold text-white">{activeCount}</span>}
      </button>
    </div>
    <dialog ref={dialog} aria-labelledby="cars-filter-title" onKeyDown={trapFocus} onClose={() => {
      setSession(value => value + 1);
      if (trigger.current?.getClientRects().length) trigger.current.focus();
    }} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 h-[calc(100dvh-1rem)] max-h-none w-full max-w-none overflow-hidden rounded-t-2xl bg-white text-[#0F2342] backdrop:bg-[#0F2342]/50 md:hidden">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-[#E3EEF9] px-4 py-2">
          <h2 id="cars-filter-title" className="text-xl font-semibold">Filters</h2>
          <button type="button" aria-label="Close filters" onClick={() => dialog.current?.close()} className={`grid size-11 place-items-center rounded-xl text-[#0A3D91] ${focus}`}><X size={21}/></button>
        </div>
        <CarListFilters key={`${searchKey}:${session}`} search={search} sheet dateInput={dateInput} onDone={() => dialog.current?.close()}/>
      </div>
    </dialog>
    <DesktopSearchForm key={searchKey} search={search}/>
  </>;
}

function DesktopSearchForm({ search }: { search: CarSearch }) {
  const router = useRouter();
  const [from, setFrom] = useState(search.from ?? "");
  const [to, setTo] = useState(search.to ?? "");
  const [pickup, setPickup] = useState(search.pickup ?? "");

  return <form noValidate onSubmit={event => {
      event.preventDefault();
      router.replace(carsUrl({ ...search, from: from || undefined, to: to || undefined, pickup: pickup.trim() || undefined }), { scroll: false });
    }} className="hidden min-w-0 items-end gap-3 rounded-2xl border border-[#D6E6F7] bg-white p-4 shadow-sm md:grid md:grid-cols-[1fr_1fr_minmax(0,1.5fr)_auto]">
      <DateFields from={from} to={to} setFrom={setFrom} setTo={setTo}/>
      <label className="min-w-0 text-sm font-semibold">Pickup place<input type="text" maxLength={80} value={pickup} onChange={event => setPickup(event.target.value)} placeholder="e.g. Panglao" className={`mt-1 ${field}`}/></label>
      <button className={primary}><Search size={17} aria-hidden/>Search</button>
    </form>;
}

function DateFields({ from, to, setFrom, setTo, dateInput }: {
  from: string; to: string; setFrom: (value: string) => void; setTo: (value: string) => void;
  dateInput?: React.Ref<HTMLInputElement>;
}) {
  return <>
    <label className="min-w-0 text-sm font-semibold">Pickup date<input ref={dateInput} type="date" value={from} onChange={event => setFrom(event.target.value)} className={`mt-1 block ${field}`}/></label>
    <label className="min-w-0 text-sm font-semibold">Return date<input type="date" min={from || undefined} value={to} onChange={event => setTo(event.target.value)} className={`mt-1 block ${field}`}/></label>
  </>;
}

export function CarListFilters({ search, sheet = false, dateInput, onDone }: {
  search: CarSearch; sheet?: boolean; dateInput?: React.Ref<HTMLInputElement>; onDone?: () => void;
}) {
  const router = useRouter();
  const [seats, setSeats] = useState(search.seats ?? 0);
  const [type, setType] = useState(search.type ?? "");
  const [transmission, setTransmission] = useState(search.transmission ?? "");
  const [sort, setSort] = useState(search.sort ?? "recommended");
  const [rating, setRating] = useState(search.rating ? String(search.rating) : "");
  const [from, setFrom] = useState(search.from ?? "");
  const [to, setTo] = useState(search.to ?? "");
  const [pickup, setPickup] = useState(search.pickup ?? "");
  const [minPrice, setMinPrice] = useState(search.minPrice == null ? "" : String(search.minPrice));
  const [maxPrice, setMaxPrice] = useState(search.maxPrice == null ? "" : String(search.maxPrice));
  const motorcycle = search.vehicle === "motorcycle";
  const maxSeats = motorcycle ? 2 : 20;
  const kinds = motorcycle ? ["Scooter", "Standard", "Adventure", "Big bike"] : ["Sedan", "SUV", "MPV", "Van", "Pickup", "Coupe", "Other"];
  const clear = carsUrl({ mode: search.mode });

  function apply() {
    router.replace(carsUrl({
      ...search, from: from || undefined, to: to || undefined, seats: seats || undefined,
      pickup: sheet ? pickup.trim() || undefined : search.pickup,
      type: type || undefined, transmission: transmission || undefined,
      minPrice: minPrice ? Number(minPrice) : undefined, maxPrice: maxPrice ? Number(maxPrice) : undefined,
      rating: rating ? Number(rating) : undefined, sort,
    }), { scroll: false });
    onDone?.();
  }

  return <form noValidate onSubmit={event => { event.preventDefault(); apply(); }} className={sheet ? "flex min-h-0 flex-1 flex-col" : "rounded-2xl border border-[#D6E6F7] bg-white p-4"}>
    {!sheet && <div className="mb-4 flex items-center justify-between gap-2"><h2 className="font-semibold">Filters</h2><Link href={clear} className={chip}>Clear all</Link></div>}
    <div className={sheet ? "min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 max-md:[&_input]:text-base max-md:[&_select]:text-base" : "space-y-4"}>
      {sheet && <fieldset><legend className="mb-2 font-semibold">Dates</legend><div className="grid gap-2 min-[360px]:grid-cols-2"><DateFields from={from} to={to} setFrom={setFrom} setTo={setTo} dateInput={dateInput}/></div><label className="mt-2 block text-sm font-semibold">Pickup place<input maxLength={80} value={pickup} onChange={event => setPickup(event.target.value)} placeholder="e.g. Panglao" className={`mt-1 ${field}`}/></label></fieldset>}
      <fieldset><legend className="mb-2 text-sm font-semibold">{motorcycle ? "Motorcycle type" : "Vehicle type"}</legend>
        <div className={sheet ? "flex flex-wrap gap-2" : "grid grid-cols-2 gap-1"}>
          {["", ...kinds].map(kind => <button key={kind} type="button" aria-pressed={type.toLowerCase() === kind.toLowerCase()} onClick={() => setType(kind)} className={chip}>{!sheet && <span aria-hidden className={`mr-1 grid size-4 shrink-0 place-items-center rounded border ${type.toLowerCase() === kind.toLowerCase() ? "border-[#0B63CE] bg-[#0B63CE] text-white" : "border-[#D6E6F7]"}`}>{type.toLowerCase() === kind.toLowerCase() && "✓"}</span>}{kind || "Any type"}</button>)}
        </div>
      </fieldset>
      <fieldset><legend className="mb-2 text-sm font-semibold">Price per day</legend><div className="grid grid-cols-2 gap-2">
        <label className="min-w-0 text-[13px]">Min ₱<input type="number" min="0" step="any" inputMode="decimal" value={minPrice} onChange={event => setMinPrice(event.target.value)} className={`mt-1 ${field}`}/></label>
        <label className="min-w-0 text-[13px]">Max ₱<input type="number" min="0" step="any" inputMode="decimal" value={maxPrice} onChange={event => setMaxPrice(event.target.value)} className={`mt-1 ${field}`}/></label>
      </div></fieldset>
      <fieldset><legend className="mb-2 text-sm font-semibold">{motorcycle ? "Passengers" : "Seats"} <span className="font-normal text-[#5B6F89]">· minimum</span></legend>
        {!sheet && <div className="mb-2 flex flex-wrap gap-1">{(motorcycle ? [0, 1, 2] : [0, 4, 5, 7]).map(value => <button type="button" key={value} aria-pressed={seats === value} onClick={() => setSeats(value)} className={chip}>{value || "Any"}</button>)}</div>}
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Decrease minimum" disabled={seats === 0} onClick={() => setSeats(Math.min(maxSeats, Math.max(0, seats - 1)))} className={`${chip} min-w-11 justify-center disabled:opacity-40 disabled:hover:bg-white`}>−</button>
          <output aria-live="polite" className="min-w-12 text-center text-sm">{seats || "Any"}</output>
          <button type="button" aria-label="Increase minimum" disabled={seats >= maxSeats} onClick={() => setSeats(seats + 1)} className={`${chip} min-w-11 justify-center disabled:opacity-40 disabled:hover:bg-white`}>+</button>
        </div>
      </fieldset>
      <fieldset><legend className="mb-2 text-sm font-semibold">Transmission</legend><div className="flex flex-wrap gap-2">
        {["", "Automatic", "Manual", ...(motorcycle ? ["Semi-automatic"] : [])].map(option => <button type="button" key={option} aria-pressed={transmission.toLowerCase() === option.toLowerCase()} onClick={() => setTransmission(option)} className={chip}>{option || "Any"}</button>)}
      </div></fieldset>
      <label className="grid gap-1.5 text-sm font-semibold">Minimum rating<FilterSelect value={rating} onChange={event => setRating(event.target.value)}>
        <option value="">Any rating</option>{[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value}+ stars</option>)}
      </FilterSelect></label>
      {sheet && <label className="grid gap-1.5 text-sm font-semibold">Sort by<FilterSelect value={sort} onChange={event => setSort(event.target.value as typeof sort)}><SortOptions/></FilterSelect></label>}
    </div>
    <div className={sheet ? "grid grid-cols-2 gap-2 border-t border-[#E3EEF9] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" : "mt-4"}>
      {sheet && <Link href={clear} scroll={false} onNavigate={onDone} className={`${chip} justify-center`}>Clear all</Link>}
      <button className={`${primary} w-full`}>{sheet ? "Show results" : "Apply filters"}</button>
    </div>
  </form>;
}
