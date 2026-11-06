"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CarFront, CircleCheck, CircleX, Clock3, LoaderCircle, MapPin, RotateCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type CustomerBooking = {
  id: string;
  reference: string;
  mode: "self_drive" | "with_driver";
  start_date: string;
  end_date: string;
  pickup_time: string | null;
  pickup_location: string | null;
  itinerary_notes: string | null;
  daily_rate: number;
  total_price: number;
  deposit_amount: number;
  amount_due_now: number;
  status: string;
  payment: string;
  created_at: string;
  car: { brand: string; model: string; year: number | null; car_type: string | null } | null;
};

const statusStyles: Record<string, string> = {
  pending: "bg-[#fff6e8] text-[#9b6818]",
  awaiting_payment: "bg-[#fff6e8] text-[#9b6818]",
  payment_review: "bg-[#edf2ff] text-[#315ec8]",
  expired: "bg-[#f2f4f7] text-[#778397]",
  confirmed: "bg-[#edf2ff] text-[#315ec8]",
  picked_up: "bg-[#f0edff] text-[#6a50a2]",
  returned: "bg-[#edf2ff] text-[#315ec8]",
  completed: "bg-[#edf7f1] text-[#28754e]",
  cancelled: "bg-[#f2f4f7] text-[#778397]",
  rejected: "bg-[#fff0f0] text-[#a14343]",
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${date}T00:00:00`));
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(value);
}

function canCancel(booking: CustomerBooking, todayManila: string) {
  return ["awaiting_payment", "payment_review", "confirmed"].includes(booking.status) && booking.start_date > todayManila;
}

export function BookingList({ bookings, todayManila }: { bookings: CustomerBooking[]; todayManila: string }) {
  const router = useRouter();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function cancelBooking(booking: CustomerBooking) {
    if (!window.confirm(`Cancel booking ${booking.reference}? This action cannot be undone.`)) return;
    setCancellingId(booking.id);
    setError("");
    try {
      const supabase = createClient();
      const { error: cancelError } = await supabase.rpc("cancel_booking", { p_booking_id: booking.id, p_reason: "Cancelled by customer" });
      if (cancelError) throw cancelError;
      router.refresh();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "This booking could not be cancelled. Please try again.");
    } finally {
      setCancellingId(null);
    }
  }

  if (!bookings.length) return <div className="rounded-2xl border border-[#e3e8ef] bg-white px-6 py-14 text-center shadow-sm"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#edf2ff] text-[#4d71cc]"><CalendarDays size={21}/></span><h2 className="mt-4 text-base font-semibold text-[#34445b]">No bookings yet</h2><p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-[#7d8998]">When you book a vehicle, you’ll find the schedule, status, and rental details here.</p><a href="/" className="mt-5 inline-flex h-9 items-center rounded-lg bg-[#2457d6] px-4 text-xs font-semibold text-white hover:bg-[#1d4ed8]">Browse rentals</a></div>;

  return <div className="space-y-4">{error && <p role="alert" className="rounded-xl border border-[#f1cccc] bg-[#fff6f6] px-4 py-3 text-xs text-[#a13a3a]">{error}</p>}{bookings.map((booking) => {
    const cancelAllowed = canCancel(booking, todayManila);
    return <article key={booking.id} className="overflow-hidden rounded-2xl border border-[#e3e8ef] bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0f4] px-4 py-3.5 sm:px-5"><div><p className="text-[10px] font-medium uppercase tracking-wide text-[#8b97a7]">Booking reference</p><p className="mt-0.5 text-xs font-semibold text-[#43536a]">{booking.reference}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize ${statusStyles[booking.status] ?? "bg-[#f2f4f7] text-[#68778c]"}`}>{booking.status.replaceAll("_", " ")}</span></div>
      <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5"><div className="flex min-w-0 gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f1f4fa] text-[#5e75a8]"><CarFront size={21}/></span><div className="min-w-0"><h2 className="truncate text-sm font-semibold text-[#2d3e55]">{booking.car ? `${booking.car.year ? `${booking.car.year} ` : ""}${booking.car.brand} ${booking.car.model}` : "Rental vehicle"}</h2><p className="mt-1 text-[11px] text-[#7d8998]">{booking.mode === "self_drive" ? "Self drive" : "With driver"}{booking.car?.car_type ? ` · ${booking.car.car_type}` : ""}</p><div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-[#637188]"><span className="inline-flex items-center gap-1.5"><CalendarDays size={12} className="text-[#7890ca]"/>{formatDate(booking.start_date)} – {formatDate(booking.end_date)}</span><span className="inline-flex items-center gap-1.5"><MapPin size={12} className="text-[#7890ca]"/>{booking.pickup_location || "Pickup location to be confirmed"}{booking.pickup_time ? ` · ${booking.pickup_time.slice(0, 5)}` : ""}</span></div>{booking.itinerary_notes && <p className="mt-2 whitespace-pre-wrap text-[10px] leading-4 text-[#637188]">Itinerary: {booking.itinerary_notes}</p>}</div></div>
        <div className="flex items-center justify-between gap-4 border-t border-[#edf0f4] pt-3 sm:block sm:border-0 sm:pt-0 sm:text-right"><div><p className="text-[10px] text-[#8995a5]">Rental total</p><p className="mt-0.5 text-sm font-semibold text-[#2d3e55]">{formatPrice(Number(booking.total_price))}</p><p className="mt-0.5 text-[10px] text-[#8995a5]">{formatPrice(Number(booking.daily_rate))} / day · {booking.payment}</p></div>{cancelAllowed ? <button onClick={() => cancelBooking(booking)} disabled={cancellingId === booking.id} className="mt-2 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#eadede] px-3 text-[10px] font-semibold text-[#9a4b4b] transition hover:bg-[#fff6f6] disabled:opacity-60">{cancellingId === booking.id ? <LoaderCircle size={12} className="animate-spin"/> : <CircleX size={12}/>}Cancel booking</button> : <p className="mt-2 inline-flex items-center gap-1 text-[10px] text-[#8995a5]">{booking.status === "completed" ? <CircleCheck size={12}/> : <Clock3 size={12}/>} {booking.status === "completed" ? "Rental completed" : "Cancellation unavailable"}</p>}</div>
      </div>
      {["awaiting_payment", "payment_review"].includes(booking.status) && <div className="border-t border-[#edf0f4] px-4 py-3 text-right sm:px-5"><a href={`/account/bookings/${booking.id}/pay`} className="inline-flex h-8 items-center rounded-lg bg-[#2457d6] px-3 text-[10px] font-semibold text-white">{booking.status === "payment_review" ? "View payment" : "Pay deposit"}</a></div>}
    </article>;
  })}<div className="flex items-center gap-2 px-1 text-[10px] leading-5 text-[#8b97a7]"><RotateCw size={12}/>Booking status updates as your rental progresses.</div></div>;
}
