"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { Spinner } from "@/components/loading/Spinner";
import { SubmitButton } from "@/components/loading/SubmitButton";
import { AvailabilityCalendar, availabilityErrorMessage } from "@/components/customer/availability-calendar";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { localCalendarDate, overlapsAvailability, type AvailabilityPeriod } from "@/lib/cars/availability";

type Props = {
  path: string; from?: string; to?: string; mode: string; pickup?: string; today: string;
  through: string; periods: AvailabilityPeriod[] | null;
};

const inputClass = "mt-1 h-11 w-full min-w-0 rounded-xl border border-[#D6E6F7] bg-white px-2 text-sm font-normal";

function useDateNavigation({ path, from, to, mode, pickup }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const key = `booking-summary:${path}`;

  useEffect(() => {
    if (pending) return;
    try {
      if (sessionStorage.getItem(key) !== window.location.search) return;
      sessionStorage.removeItem(key);
      document.getElementById("booking-summary")?.scrollIntoView({ block: "start" });
    } catch {}
  }, [key, from, to, mode, pickup, pending]);

  function updateDates(start: string, end: string) {
    if (pending) return;
    const params = new URLSearchParams({ from: start, to: end, mode });
    if (pickup) params.set("pickup", pickup);
    if (window.location.search === `?${params}`) {
      document.getElementById("booking-summary")?.scrollIntoView({ block: "start" });
      return;
    }
    try { sessionStorage.setItem(key, `?${params}`); } catch {}
    startTransition(() => router.replace(`${path}?${params}`, { scroll: false }));
  }
  return { pending, updateDates };
}

export function ListingAvailabilityCalendar(props: Props) {
  const { pending, updateDates } = useDateNavigation(props);
  return <div className="theme-public rounded-2xl border border-[#D6E6F7] bg-white p-2 sm:p-4">
    {props.periods ? <AvailabilityCalendar key={`${props.from}-${props.to}`} {...props} periods={props.periods} busy={pending} onRange={updateDates} />
      : <p role="status" className="text-sm text-red-800">{availabilityErrorMessage}</p>}
    {pending && <p role="status" className="mt-2 text-center text-xs">Updating dates...</p>}
  </div>;
}

export function DateUpdateForm(props: Props & { invalid: boolean }) {
  const { path, from, to, mode, pickup, today, periods, invalid } = props;
  const { pending, updateDates } = useDateNavigation(props);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const format = (day: string) => new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(localCalendarDate(day));

  return <form action={`${path}#booking-summary`} method="get" className="mt-4 grid grid-cols-2 gap-3 text-xs" onSubmit={event => {
    event.preventDefault();
    if (pending) return;
    const fields = new FormData(event.currentTarget);
    const start = String(fields.get("from") ?? "");
    const end = String(fields.get("to") ?? "");
    if (start < today || end <= start) return setError("Choose a return date after pickup.");
    if (periods && overlapsAvailability(start, end, periods)) return setError("These dates are not available for this vehicle.");
    setError("");
    updateDates(start, end);
  }}>
    <input type="hidden" name="mode" value={mode} />
    {pickup && <input type="hidden" name="pickup" value={pickup} />}
    {periods ? <>
      <input type="hidden" name="from" value={from ?? ""} />
      <input type="hidden" name="to" value={to ?? ""} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger type="button" disabled={pending} className="col-span-2 flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#0B63CE] px-3 text-sm font-semibold text-[#0B63CE] disabled:opacity-60">
          {pending ? <Spinner className="size-4" /> : <CalendarDays size={16} aria-hidden="true" />}
          {pending ? "Updating dates..." : from && to ? `${format(from)} to ${format(to)}` : "Choose pickup and return"}
        </PopoverTrigger>
        <PopoverContent align="end" className="theme-public w-max max-w-[calc(100vw-1rem)] overflow-auto">
          <PopoverTitle className="px-2 text-sm">Choose pickup and return</PopoverTitle>
          <AvailabilityCalendar {...props} periods={periods} busy={pending} onRange={(start, end) => {
            setOpen(false);
            updateDates(start, end);
          }} />
        </PopoverContent>
      </Popover>
    </> : <>
      <label className="min-w-0 font-semibold">Pickup<input key={from ?? "pickup"} required name="from" type="date" min={today} defaultValue={from} className={inputClass} /></label>
      <label className="min-w-0 font-semibold">Return<input key={to ?? "return"} required name="to" type="date" min={today} defaultValue={to} className={inputClass} /></label>
      <SubmitButton unstyled busy={pending} pendingText="Updating dates..." className="col-span-2 min-h-11 rounded-full border border-[#0B63CE] text-sm font-semibold text-[#0B63CE] disabled:opacity-60">Update dates</SubmitButton>
    </>}
    {(error || invalid) && <p role="alert" className="col-span-2 text-red-800">{error || "Choose valid rental dates with return after pickup."}</p>}
  </form>;
}
