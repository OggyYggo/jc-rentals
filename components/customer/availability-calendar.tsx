"use client";

import { useState, useSyncExternalStore } from "react";
import { type DateRange, type Modifiers } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { calendarDayKey, localCalendarDate, overlapsAvailability, type AvailabilityPeriod } from "@/lib/cars/availability";

const states = {
  booked: { label: "Booked", style: "bg-blue-200 text-blue-950" },
  held: { label: "Reserved (awaiting payment)", style: "bg-amber-100 text-amber-950 bg-[repeating-linear-gradient(135deg,transparent_0_4px,#fcd38a_4px_6px)]" },
  blocked: { label: "Not available", style: "relative bg-slate-300 text-slate-950 after:absolute after:right-0 after:top-0 after:text-[9px] after:content-['x']" },
  past: { label: "Past", style: "bg-slate-100 text-slate-500" },
};

function subscribe(callback: () => void) {
  const media = window.matchMedia("(min-width: 768px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const desktop = () => window.matchMedia("(min-width: 768px)").matches;
const mobile = () => false;

export const availabilityErrorMessage = "We could not load availability. Please refresh.";

export function AvailabilityCalendar({ today, through, periods, from, to, onRange, busy = false }: {
  today: string; through: string; periods: AvailabilityPeriod[]; from?: string; to?: string;
  onRange: (from: string, to: string) => void; busy?: boolean;
}) {
  const isDesktop = useSyncExternalStore(subscribe, desktop, mobile);
  const [selected, setSelected] = useState<DateRange | undefined>(() =>
    from && to && !overlapsAvailability(from, to, periods)
      ? { from: localCalendarDate(from), to: localCalendarDate(to) } : undefined);
  const [invalid, setInvalid] = useState(false);
  const firstDay = localCalendarDate(today);
  const lastDay = localCalendarDate(through);
  const match = (kind: AvailabilityPeriod["kind"]) => (date: Date) => {
    const day = calendarDayKey(date);
    return day >= today && periods.some(period => period.kind === kind && period.start <= day && period.end >= day);
  };
  const stateLabel = (modifiers: Modifiers = {}) => Object.entries(states)
    .filter(([kind]) => modifiers[kind]).map(([, state]) => state.label).join(", ");
  const labelDay = (date: Date, modifiers?: Modifiers) => {
    const day = new Intl.DateTimeFormat("en-PH", { dateStyle: "full" }).format(date);
    return [day, stateLabel(modifiers)].filter(Boolean).join(", ");
  };
  return <fieldset disabled={busy} aria-busy={busy} className="min-w-0">
    <Calendar mode="range" selected={selected} min={1} excludeDisabled resetOnSelect
      startMonth={firstDay} endMonth={lastDay} defaultMonth={from ? localCalendarDate(from) : firstDay}
      today={firstDay} numberOfMonths={isDesktop ? 2 : 1}
      showOutsideDays={false}
      disabled={[{ before: firstDay }, { after: lastDay }, match("booked"), match("held"), match("blocked")]}
      modifiers={{ booked: match("booked"), held: match("held"), blocked: match("blocked"), past: { before: firstDay } }}
      modifiersClassNames={Object.fromEntries(Object.entries(states).map(([kind, state]) => [kind, state.style]))}
      classNames={{ disabled: "rdp-disabled [&_button]:opacity-100" }}
      labels={{ labelDayButton: labelDay, labelGridcell: labelDay }}
      className="mx-auto [--cell-size:--spacing(8)]"
      onSelect={(range, clicked) => {
        setSelected(range);
        const start = range?.from && calendarDayKey(range.from);
        const end = range?.to && calendarDayKey(range.to);
        const [first, last] = [selected?.from ? calendarDayKey(selected.from) : calendarDayKey(clicked), calendarDayKey(clicked)].sort();
        const crossed = selected?.from && !selected.to && overlapsAvailability(first, last, periods);
        setInvalid(Boolean(crossed));
        if (start && end && start < end && !crossed && !overlapsAvailability(start, end, periods)) onRange(start, end);
      }} />
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 px-2 text-xs text-[#51657F]">
      {Object.entries(states).map(([kind, state]) => <li key={kind} className="flex items-center gap-1.5">
        <span aria-hidden="true" className={`size-3 rounded-sm ${state.style}`} />{state.label}
      </li>)}
    </ul>
    <p className="mt-3 px-2 text-xs text-[#51657F]">Booked and reserved dates cannot be selected.</p>
    {invalid && <p role="status" className="mt-2 px-2 text-xs text-red-800">Choose dates that do not cross an unavailable day.</p>}
  </fieldset>;
}
