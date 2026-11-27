"use client";

import { createContext, useContext, useRef, useState, useTransition, type ReactNode } from "react";
import { showConnectionDialog } from "@/lib/alerts/connection";
import { slowConnectionToast } from "@/lib/alerts/toast";
import { connectionError, isOffline, withConnectionDeadline } from "@/lib/connection/request";

const BookingPending = createContext(false);
export const useBookingPending = () => useContext(BookingPending);

export function BookingRequestForm({ action, amount, className, children }: {
  action: (data: FormData) => Promise<void>; amount: number; className: string; children: ReactNode;
}) {
  const [uncertain, setUncertain] = useState(false);
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  async function submit(data: FormData) {
    const time = new Date();
    const slow = setTimeout(() => void slowConnectionToast(), 8000);
    try {
      await withConnectionDeadline(() => action(data));
    } catch (error) {
      const issue = connectionError(error);
      if (!issue) throw error;
      if (!issue.sent) return;
      setUncertain(true);
      await showConnectionDialog({ time, amount, statusHref: "/account/bookings" }, false);
    } finally { clearTimeout(slow); inFlight.current = false; }
  }
  return <form onSubmit={event => {
    event.preventDefault();
    if (inFlight.current || uncertain || isOffline()) return;
    const data = new FormData(event.currentTarget);
    inFlight.current = true;
    startTransition(() => submit(data));
  }} className={className}>
    <fieldset disabled={uncertain} className="contents"><BookingPending.Provider value={pending}>{children}</BookingPending.Provider></fieldset>
    {uncertain && <a href="/account/bookings" className="inline-flex min-h-11 items-center text-sm font-semibold text-[#0A47B1] underline">Check your bookings</a>}
  </form>;
}
