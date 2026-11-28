"use client";

import { CopyButton } from "@/components/ui/CopyButton";

import { cancelWithPreview } from "@/lib/cancellation-dialog";

import { runWithAlerts } from "@/lib/alerts/run";
import { useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, CircleDollarSign, CircleX, LoaderCircle, RotateCcw, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { paymentDate } from "@/lib/payment-format";
import { StatusPill, formatPeso, formatShortDate } from "@/components/owner/ui";

export type OwnerBooking = {
  id: string;
  reference: string;
  start_date: string;
  end_date: string;
  pickup_time: string | null;
  pickup_location: string | null;
  itinerary_notes: string | null;
  total_price: number;
  commission_amount: number;
  owner_earnings: number;
  status: string;
  payment: string;
  deposit_refund_status: string;
  refund_amount: number;
  cancelled_at: string | null;
  amount_paid_online: number;
  amount_due_now: number;
  balance_at_pickup: number;
  mode: string;
  created_at: string;
  customer: { full_name: string; phone: string | null } | null;
  pickup_event?: { kind: string; created_at: string; staff_name?: string | null };
  car: { id: string; brand: string; model: string; plate_number: string | null } | null;
};

type StatusAction = "confirmed" | "rejected" | "picked_up" | "returned" | "completed";

export function BookingWorkflow({ bookings, todayManila }: { bookings: OwnerBooking[]; todayManila: string }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<Record<string, string>>({});

  function updateStatus(booking: OwnerBooking, nextStatus: StatusAction) {
    const labels = {
      confirmed: ["Confirm this booking?", "Confirm booking", "Booking confirmed"],
      rejected: ["Decline this booking?", "Decline booking", "Booking declined"],
      picked_up: ["Mark this booking as picked up?", "Mark picked up", "Pickup recorded"],
      returned: ["Mark this vehicle as returned?", "Mark returned", "Return recorded"],
      completed: ["Complete this booking?", "Complete booking", "Booking completed"],
    };
    const [title, confirmText, success] = labels[nextStatus];
    const decline = nextStatus === "rejected";
    return runWithAlerts({
      confirm: decline ? undefined : { title, text: booking.reference, confirmText },
      reason: decline ? { title, text: booking.reference, label: "Reason for declining", confirmText } : undefined,
      setPending: (pending) => setBusyId(pending ? booking.id : null),
      run: async (reason) => {
        const db = createClient();
        const { error } = decline
          ? await db.rpc("decline_pending_booking", { p_booking_id: booking.id, p_reason: reason })
          : await db.rpc("owner_set_booking_status", { booking_uuid: booking.id, next_status: nextStatus });
        if (error) throw error;
      },
      success,
      refresh: router.refresh,
    });
  }

  function cancelBooking(booking: OwnerBooking, mode: "auto" | "no_show" = "auto") {
    return cancelWithPreview({ booking, mode, refresh: router.refresh,
      setPending: pending => setBusyId(pending ? booking.id : null) });
  }

  function markPaid(booking: OwnerBooking) {
    return runWithAlerts({
      confirm: {
        title: `Record ${formatPeso(Number(booking.balance_at_pickup ?? booking.total_price))} as received for ${booking.reference}?`,
        confirmText: "Record payment",
      },
      setPending: (pending) => setBusyId(pending ? booking.id : null),
      run: async () => {
        const { error } = await createClient().rpc("owner_mark_payment_received", {
          booking_uuid: booking.id, payment_method: paymentMethods[booking.id] ?? "cash",
        });
        if (error) throw error;
      },
      success: "Payment recorded",
      refresh: router.refresh,
    });
  }

  function actionsFor(booking: OwnerBooking) {
    const disabled = busyId === booking.id;
    const busyIcon = disabled ? <LoaderCircle size={12} className="animate-spin"/> : null;
    if (booking.status === "pending") return <div className="flex flex-wrap gap-1.5"><ActionButton disabled={disabled} tone="blue" onClick={() => updateStatus(booking, "confirmed")}>{busyIcon ?? <Check size={12}/>}Approve</ActionButton><ActionButton disabled={disabled} tone="red" onClick={() => updateStatus(booking, "rejected")}>{busyIcon ?? <CircleX size={12}/>}Reject</ActionButton></div>;
    if (booking.status === "confirmed") return <ActionButton disabled={disabled} tone="blue" onClick={() => updateStatus(booking, "picked_up")}>{busyIcon ?? <Truck size={12}/>}Mark picked up</ActionButton>;
    if (booking.status === "picked_up") return <ActionButton disabled={disabled} tone="blue" onClick={() => updateStatus(booking, "returned")}>{busyIcon ?? <RotateCcw size={12}/>}Mark returned</ActionButton>;
    if (booking.status === "returned") return <ActionButton disabled={disabled} tone="blue" onClick={() => updateStatus(booking, "completed")}>{busyIcon ?? <Check size={12}/>}Complete</ActionButton>;
    return null;
  }

  function bookingControls(booking: OwnerBooking) {
    return <div className="flex flex-wrap items-center gap-2">{actionsFor(booking)}{["awaiting_payment", "payment_review", "confirmed"].includes(booking.status) && <ActionButton disabled={busyId === booking.id} tone="red" onClick={() => cancelBooking(booking)}>Cancel booking</ActionButton>}{booking.start_date <= todayManila && ["awaiting_payment", "payment_review", "confirmed"].includes(booking.status) && <ActionButton disabled={busyId === booking.id} tone="red" onClick={() => cancelBooking(booking, "no_show")}>Customer didn’t show up</ActionButton>}{booking.payment !== "paid" && ["confirmed", "picked_up"].includes(booking.status) && <><select aria-label="Payment method" value={paymentMethods[booking.id] ?? "cash"} onChange={(event) => setPaymentMethods((current) => ({ ...current, [booking.id]: event.target.value }))} className="h-8 rounded-lg border border-[#e1e7ef] bg-white px-2 text-[10px] text-[#5e6e83]"><option value="cash">Cash</option><option value="gcash">GCash</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select><ActionButton disabled={busyId === booking.id} tone="green" onClick={() => markPaid(booking)}>{busyId === booking.id ? <LoaderCircle size={12} className="animate-spin"/> : <CircleDollarSign size={13}/>}Mark payment received</ActionButton></>}</div>;
  }

  function pickupLabel(booking: OwnerBooking) {
    const event = booking.pickup_event;
    if (!event) return null;
    return <p className="mt-1 text-xs text-slate-600">
      {event.kind === "manual" ? "Picked up manually" : "Picked up by scan"}{event.staff_name && ` · ${event.staff_name} (staff)`} · {paymentDate(event.created_at)} Manila time
    </p>;
  }

  if (!bookings.length) return <div className="rounded-xl border border-[#e7ecf3] bg-white px-6 py-16 text-center"><span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-[#edf2ff] text-[#4c6fc9]"><Check size={20}/></span><h2 className="mt-4 text-sm font-semibold text-[#43536a]">All caught up</h2><p className="mt-1 text-xs text-[#8793a3]">New booking requests will appear here.</p></div>;

  return <div className="space-y-2.5 sm:space-y-4">{bookings.map((booking) => <article id={`trip-${booking.id}`} key={booking.id} className="rounded-xl border border-[#e7ecf3] bg-white shadow-[0_2px_6px_rgba(20,42,78,.025)] sm:p-5">
      <div className="sm:hidden">
        <header className="px-3 pt-3">
          <div className="flex items-start justify-between gap-2">
            <h2 className="min-w-0 break-words text-sm font-semibold text-slate-900">{booking.customer?.full_name || "Customer"}</h2>
            <StatusPill status={booking.status}/>
          </div>
          <p className="mt-0.5 break-words text-xs text-slate-600">{booking.car ? `${booking.car.brand} ${booking.car.model}` : "Vehicle"} · {booking.mode === "self_drive" ? "Self drive" : "With driver"}</p>
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-xs">
            <p className="text-slate-600">{formatShortDate(booking.start_date)} – {formatShortDate(booking.end_date)}</p>
            <p className="font-semibold text-slate-900 tabular-nums">{formatPeso(Number(booking.total_price))}</p>
          </div>
          {pickupLabel(booking)}
        </header>
        <details className="group mt-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-b-xl px-3 py-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-700 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 break-words font-medium text-slate-600">Payment {booking.payment.replaceAll("_", " ")}</span>
            <span className="flex shrink-0 items-center gap-1 font-semibold text-blue-800">Details &amp; actions <ChevronDown size={15} aria-hidden className="group-open:rotate-180"/></span>
          </summary>
          <div className="space-y-3 border-t border-slate-100 px-3 py-3 text-xs text-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <p className="break-all font-medium">{booking.reference}</p>
              <CopyButton value={booking.reference} label="Copy reference"/>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
              <div><dt className="text-slate-600">Customer phone</dt><dd className="break-words font-medium">{booking.customer?.phone || "No phone on profile"}</dd></div>
              <div><dt className="text-slate-600">Plate number</dt><dd className="break-words font-medium">{booking.car?.plate_number || "—"}</dd></div>
              <div><dt className="text-slate-600">Net earnings</dt><dd className="font-medium">{formatPeso(Number(booking.owner_earnings))}</dd></div>
              <div><dt className="text-slate-600">Platform fee</dt><dd className="font-medium">{formatPeso(Number(booking.commission_amount))}</dd></div>
              <div className="col-span-2"><dt className="text-slate-600">Request received</dt><dd className="font-medium">{new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric" }).format(new Date(booking.created_at))}</dd></div>
            </dl>
            {(booking.pickup_location || booking.pickup_time || booking.itinerary_notes) && <div className="rounded-lg bg-slate-50 p-2.5">
              <p className="font-semibold">Pickup and itinerary</p>
              <p className="mt-1 break-words">{[booking.pickup_location, booking.pickup_time?.slice(0, 5)].filter(Boolean).join(" · ")}</p>
              {booking.itinerary_notes && <p className="mt-1 whitespace-pre-wrap break-words">{booking.itinerary_notes}</p>}
            </div>}
            <div className="[&_button]:min-h-11 [&_button]:text-xs [&_select]:min-h-11 [&_select]:text-xs [&:not(:has(button,select))]:hidden">
              {bookingControls(booking)}
            </div>
          </div>
        </details>
      </div>
      <div className="hidden sm:contents"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold text-[#33445b]">{booking.customer?.full_name || "Customer"}</h2><StatusPill status={booking.status}/></div><p className="mt-1 text-[10px] text-[#8b97a8]">{booking.reference} · Request received {new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric" }).format(new Date(booking.created_at))}</p><CopyButton value={booking.reference} label="Copy reference" />{pickupLabel(booking)}</div><div className="text-left sm:text-right"><p className="text-[9px] text-[#8b97a8]">Booking total</p><p className="mt-0.5 text-sm font-semibold text-[#33445b]">{formatPeso(Number(booking.total_price))}</p><p className="text-[9px] text-[#8793a3]">Net {formatPeso(Number(booking.owner_earnings))}</p></div></div>
      <div className="mt-4 grid gap-4 border-t border-[#edf0f4] pt-4 sm:grid-cols-3"><div><p className="text-[9px] font-medium uppercase tracking-wide text-[#9aa4b2]">Vehicle</p><p className="mt-1 text-[11px] font-medium text-[#4c5c72]">{booking.car ? `${booking.car.brand} ${booking.car.model}` : "Vehicle"}</p><p className="mt-0.5 text-[9px] text-[#8995a6]">{booking.car?.plate_number || (booking.mode === "self_drive" ? "Self drive" : "With driver")}</p></div><div><p className="text-[9px] font-medium uppercase tracking-wide text-[#9aa4b2]">Rental dates</p><p className="mt-1 text-[11px] font-medium text-[#4c5c72]">{formatShortDate(booking.start_date)}</p><p className="mt-0.5 text-[9px] text-[#8995a6]">through {formatShortDate(booking.end_date)}</p></div><div><p className="text-[9px] font-medium uppercase tracking-wide text-[#9aa4b2]">Customer contact</p><p className="mt-1 text-[11px] font-medium text-[#4c5c72]">{booking.customer?.phone || "No phone on profile"}</p><p className="mt-0.5 text-[9px] text-[#8995a6] capitalize">Payment {booking.payment}</p></div></div>
      {(booking.pickup_location || booking.pickup_time || booking.itinerary_notes) && <div className="mt-3 rounded-lg bg-[#f8faff] px-3.5 py-3"><p className="text-[9px] font-semibold uppercase tracking-wide text-[#8390a3]">Pickup and itinerary</p><p className="mt-1 text-[10px] text-[#4c5c72]">{[booking.pickup_location, booking.pickup_time ? `Pickup ${booking.pickup_time.slice(0, 5)}` : null].filter(Boolean).join(" · ") || "No pickup details"}</p>{booking.itinerary_notes && <p className="mt-1 whitespace-pre-wrap text-[10px] leading-4 text-[#6c7a8e]">{booking.itinerary_notes}</p>}</div>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#edf0f4] pt-3">{bookingControls(booking)}<p className="text-[9px] text-[#98a2b0]">Platform fee {formatPeso(Number(booking.commission_amount))}</p></div>
      </div>
    </article>)}</div>;
}

function ActionButton({ children, onClick, disabled, tone }: { children: ReactNode; onClick: () => void; disabled: boolean; tone: "blue" | "red" | "green" }) {
  const styles = { blue: "border-[#dbe4fb] bg-[#f4f7ff] text-[#4568bd] hover:bg-[#eaf0ff]", red: "border-[#f0dddd] bg-white text-[#a14d4d] hover:bg-[#fff6f6]", green: "border-[#d9eade] bg-[#f2f8f4] text-[#3e805d] hover:bg-[#eaf5ed]" };
  return <button onClick={onClick} disabled={disabled} className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-semibold transition disabled:opacity-50 ${styles[tone]}`}>{children}</button>;
}
