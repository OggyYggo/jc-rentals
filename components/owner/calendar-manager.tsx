"use client";

import { useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, LoaderCircle, LockKeyhole, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { StatusPill, formatShortDate } from "@/components/owner/ui";

export type CalendarCar = { id: string; brand: string; model: string; plate_number: string | null };
export type CalendarBooking = { id: string; reference: string; car_id: string; start_date: string; end_date: string; status: string; customer: { full_name: string } | null; car: { brand: string; model: string } | null };
export type CalendarBlock = { id: string; car_id: string; start_date: string; end_date: string; reason: string | null; car: { brand: string; model: string } | null };

function localDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function CalendarManager({ cars, bookings, blocks }: { cars: CalendarCar[]; bookings: CalendarBooking[]; blocks: CalendarBlock[] }) {
  const router = useRouter();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [formOpen, setFormOpen] = useState(false);
  const [carId, setCarId] = useState(cars[0]?.id ?? "");
  const [startDate, setStartDate] = useState(() => localDate(new Date()));
  const [endDate, setEndDate] = useState(() => localDate(new Date()));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const firstDay = month.getDay();
  const dayCount = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const gridDays = Array.from({ length: Math.ceil((firstDay + dayCount) / 7) * 7 }, (_, index) => {
    const day = index - firstDay + 1;
    return day > 0 && day <= dayCount ? day : null;
  });
  const monthTitle = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(month);
  const today = localDate(new Date());
  const upcoming = useMemo(() => bookings.filter((booking) => !["cancelled", "rejected", "completed"].includes(booking.status) && booking.end_date >= today).sort((a, b) => a.start_date.localeCompare(b.start_date)).slice(0, 8), [bookings, today]);

  function eventsForDay(day: number) {
    const date = localDate(new Date(month.getFullYear(), month.getMonth(), day));
    return [
      ...bookings.filter((booking) => !["cancelled", "rejected"].includes(booking.status) && booking.start_date <= date && booking.end_date >= date).map((booking) => ({ id: booking.id, label: booking.car ? `${booking.car.brand} ${booking.car.model}` : booking.reference, kind: "booking" as const, status: booking.status })),
      ...blocks.filter((block) => block.start_date <= date && block.end_date >= date).map((block) => ({ id: block.id, label: block.reason || `${block.car?.brand ?? "Car"} blocked`, kind: "block" as const, status: "blocked" })),
    ].slice(0, 2);
  }

  async function addBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!carId) { setError("Add a vehicle before blocking dates."); return; }
    if (endDate < startDate) { setError("The end date must be on or after the start date."); return; }
    setBusy(true);
    try {
      const supabase = createClient();
      const { error: blockError } = await supabase.from("car_blocked_dates").insert({ car_id: carId, start_date: startDate, end_date: endDate, reason: reason.trim() || "Unavailable" });
      if (blockError) throw blockError;
      setFormOpen(false); setReason(""); router.refresh();
    } catch (blockError) { setError(blockError instanceof Error ? blockError.message : "These dates could not be blocked."); }
    finally { setBusy(false); }
  }

  async function removeBlock(id: string) {
    setBusy(true); setError("");
    try {
      const supabase = createClient();
      const { error: removeError } = await supabase.from("car_blocked_dates").delete().eq("id", id);
      if (removeError) throw removeError;
      router.refresh();
    } catch (removeError) { setError(removeError instanceof Error ? removeError.message : "This blocked date could not be removed."); }
    finally { setBusy(false); }
  }

  return <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1.6fr)_minmax(285px,.75fr)]">
    <section className="overflow-hidden rounded-xl border border-[#e7ecf3] bg-white shadow-[0_2px_6px_rgba(20,42,78,.025)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0f4] px-4 py-4 sm:px-5"><div><h2 className="text-sm font-semibold text-[#33445b]">Availability calendar</h2><p className="mt-1 text-[10px] text-[#8b97a8]">Bookings and unavailable dates across your fleet</p></div><div className="flex items-center gap-1"><button aria-label="Previous month" onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1))} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#e6ebf2] text-[#68778c] hover:bg-[#f7f9fc]"><ChevronLeft size={15}/></button><span className="min-w-[115px] text-center text-xs font-semibold text-[#45556c]">{monthTitle}</span><button aria-label="Next month" onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1))} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#e6ebf2] text-[#68778c] hover:bg-[#f7f9fc]"><ChevronRight size={15}/></button><button onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} className="ml-1 h-8 rounded-lg border border-[#e6ebf2] px-2.5 text-[10px] font-medium text-[#68778c] hover:bg-[#f7f9fc]">Today</button></div></div>
      <div className="grid grid-cols-7 border-b border-[#edf0f4] bg-[#fafbfd]">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day} className="py-2.5 text-center text-[9px] font-semibold uppercase tracking-wide text-[#96a1b0]">{day}</div>)}</div>
      <div className="grid grid-cols-7">{gridDays.map((day, index) => { const date = day ? localDate(new Date(month.getFullYear(), month.getMonth(), day)) : ""; const events = day ? eventsForDay(day) : []; return <div key={`${date}-${index}`} className={`min-h-[78px] border-b border-r border-[#f0f2f6] p-1.5 sm:min-h-[105px] sm:p-2 ${day ? "bg-white" : "bg-[#fafbfd]"}`}><div className={`ml-auto flex h-6 w-6 items-center justify-center rounded-full text-[10px] ${date === today ? "bg-[#2457d6] font-semibold text-white" : day ? "text-[#617087]" : "text-transparent"}`}>{day ?? "·"}</div><div className="mt-1 space-y-1">{events.map((event) => <div key={`${event.kind}-${event.id}`} title={event.label} className={`truncate rounded px-1 py-1 text-[8px] font-medium sm:px-1.5 sm:text-[9px] ${event.kind === "block" ? "bg-[#fff1f0] text-[#a25757]" : event.status === "pending" ? "bg-[#fff6e8] text-[#96681e]" : "bg-[#edf2ff] text-[#4568bd]"}`}>{event.label}</div>)}</div></div>; })}</div>
      <div className="flex flex-wrap gap-4 px-4 py-3 text-[9px] text-[#7e8a9c]"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm bg-[#7895e2]"/>Booking</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm bg-[#eaa49d]"/>Unavailable</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#2457d6]"/>Today</span></div>
    </section>

    <div className="space-y-4">
      <section className="rounded-xl border border-[#e7ecf3] bg-white p-4 shadow-[0_2px_6px_rgba(20,42,78,.025)] sm:p-5"><div className="flex items-start justify-between"><div><h2 className="text-sm font-semibold text-[#33445b]">Manual date blocks</h2><p className="mt-1 text-[10px] leading-4 text-[#8b97a8]">Set cars unavailable for personal use or maintenance.</p></div><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#fff1f0] text-[#ad6460]"><LockKeyhole size={15}/></span></div>
        {formOpen ? <form onSubmit={addBlock} className="mt-4 space-y-3"><Field label="Vehicle"><select required value={carId} onChange={(event) => setCarId(event.target.value)} className={inputClass}>{cars.map((car) => <option key={car.id} value={car.id}>{car.brand} {car.model} {car.plate_number ? `· ${car.plate_number}` : ""}</option>)}</select></Field><div className="grid grid-cols-2 gap-2"><Field label="Start date"><input required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className={inputClass}/></Field><Field label="End date"><input required type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} className={inputClass}/></Field></div><Field label="Reason"><input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={120} placeholder="Maintenance, personal use..." className={inputClass}/></Field>{error && <p role="alert" className="text-[10px] leading-4 text-[#a13a3a]">{error}</p>}<div className="flex gap-2"><button type="button" onClick={() => { setFormOpen(false); setError(""); }} className="h-8 flex-1 rounded-lg border border-[#e2e8f0] text-[10px] font-medium text-[#68778c]">Cancel</button><button disabled={busy || !cars.length} className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#2457d6] text-[10px] font-semibold text-white disabled:opacity-50">{busy ? <LoaderCircle size={12} className="animate-spin"/> : <Plus size={12}/>}Block dates</button></div></form> : <button disabled={!cars.length} onClick={() => setFormOpen(true)} className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#d4ddeb] text-[10px] font-semibold text-[#5b6d86] hover:border-[#9bb0e7] hover:text-[#4568bd] disabled:opacity-50"><Plus size={13}/>Add unavailable dates</button>}
        {!cars.length && <p className="mt-2 text-[9px] text-[#9aa4b2]">Add a vehicle before blocking calendar dates.</p>}
        {error && !formOpen && <p role="alert" className="mt-3 text-[10px] text-[#a13a3a]">{error}</p>}
      </section>

      <section className="rounded-xl border border-[#e7ecf3] bg-white p-4 shadow-[0_2px_6px_rgba(20,42,78,.025)] sm:p-5"><div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-semibold text-[#33445b]">Upcoming bookings</h2><p className="mt-1 text-[10px] text-[#8b97a8]">Next reservations on the calendar</p></div><Clock3 size={15} className="text-[#8a96a8]"/></div>{upcoming.length ? <div className="divide-y divide-[#eef1f5]">{upcoming.map((booking) => <div key={booking.id} className="flex items-center gap-2.5 py-3"><span className="flex h-8 w-8 shrink-0 flex-col items-center justify-center rounded-lg bg-[#edf2ff] text-[#4e6fc4]"><span className="text-[8px] uppercase">{new Intl.DateTimeFormat("en", { month: "short" }).format(new Date(`${booking.start_date}T00:00:00`))}</span><span className="text-xs font-semibold leading-3">{Number(booking.start_date.slice(8))}</span></span><div className="min-w-0 flex-1"><p className="truncate text-[10px] font-semibold text-[#4a5a71]">{booking.car ? `${booking.car.brand} ${booking.car.model}` : "Rental"}</p><p className="mt-0.5 truncate text-[9px] text-[#8c97a6]">{booking.customer?.full_name || booking.reference} · {formatShortDate(booking.end_date)}</p></div><StatusPill status={booking.status}/></div>)}</div> : <p className="py-6 text-center text-[10px] text-[#8b97a8]">No upcoming reservations.</p>}</section>

      <section className="rounded-xl border border-[#e7ecf3] bg-white p-4 shadow-[0_2px_6px_rgba(20,42,78,.025)] sm:p-5"><h2 className="text-sm font-semibold text-[#33445b]">Blocked dates</h2>{blocks.length ? <div className="mt-2 divide-y divide-[#eef1f5]">{blocks.slice(0, 8).map((block) => <div key={block.id} className="flex items-center gap-2 py-2.5"><div className="min-w-0 flex-1"><p className="truncate text-[10px] font-medium text-[#516078]">{block.car?.brand} {block.car?.model} · {block.reason || "Unavailable"}</p><p className="mt-0.5 text-[9px] text-[#8a96a8]">{formatShortDate(block.start_date)} – {formatShortDate(block.end_date)}</p></div><button aria-label="Remove date block" disabled={busy} onClick={() => removeBlock(block.id)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#9b7373] hover:bg-[#fff2f2]"><Trash2 size={13}/></button></div>)}</div> : <p className="mt-2 py-4 text-center text-[10px] text-[#8b97a8]">No manual blocks set.</p>}</section>
    </div>
  </div>;
}

const inputClass = "h-9 w-full rounded-lg border border-[#dfe5ec] bg-white px-2.5 text-[10px] text-[#43536a] outline-none focus:border-[#94a9e9] focus:ring-3 focus:ring-[#2457d6]/10";
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block text-[10px] font-medium text-[#69788e]">{label}<div className="mt-1.5">{children}</div></label>; }
