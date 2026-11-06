"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleDollarSign, CircleX, LoaderCircle, RotateCcw, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
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
  deposit_refund_status?: string;
  mode: string;
  created_at: string;
  customer: { full_name: string; phone: string | null } | null;
  car: { id: string; brand: string; model: string; plate_number: string | null } | null;
};

type StatusAction = "confirmed" | "rejected" | "picked_up" | "returned" | "completed";

export function BookingWorkflow({ bookings }: { bookings: OwnerBooking[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  async function updateStatus(booking: OwnerBooking, nextStatus: StatusAction) {
    const prompt = nextStatus === "rejected" ? `Reject booking ${booking.reference}?` : nextStatus === "confirmed" ? `Approve booking ${booking.reference}?` : undefined;
    if (prompt && !window.confirm(prompt)) return;
    setBusyId(booking.id); setError("");
    try {
      const supabase = createClient();
      const { error: actionError } = await supabase.rpc("owner_set_booking_status", { booking_uuid: booking.id, next_status: nextStatus });
      if (actionError) throw actionError;
      router.refresh();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Could not update this booking."); }
    finally { setBusyId(null); }
  }

  async function markPaid(booking: OwnerBooking) {
    if (!window.confirm(`Record ${formatPeso(Number(booking.total_price))} as received for ${booking.reference}?`)) return;
    setBusyId(booking.id); setError("");
    try {
      const supabase = createClient();
      const { error: paymentError } = await supabase.rpc("owner_mark_payment_received", { booking_uuid: booking.id, payment_method: paymentMethods[booking.id] ?? "cash" });
      if (paymentError) throw paymentError;
      router.refresh();
    } catch (paymentError) { setError(paymentError instanceof Error ? paymentError.message : "Could not update payment status."); }
    finally { setBusyId(null); }
  }

  function actionsFor(booking: OwnerBooking) {
    const disabled = busyId === booking.id;
    const busyIcon = disabled ? <LoaderCircle size={12} className="animate-spin"/> : null;
    if (["cancelled", "expired"].includes(booking.status) && booking.deposit_refund_status === "owed") return <ActionButton disabled={disabled} tone="green" onClick={async () => { if (!window.confirm("Confirm that you have sent the customer’s deposit refund?")) return; setBusyId(booking.id); const { error } = await createClient().rpc("mark_deposit_refunded", { p_booking_id: booking.id }); if (error) setError(error.message); else router.refresh(); setBusyId(null); }}>{busyIcon ?? <CircleDollarSign size={12}/>}Mark deposit refunded</ActionButton>;
    if (booking.status === "pending") return <div className="flex flex-wrap gap-1.5"><ActionButton disabled={disabled} tone="blue" onClick={() => updateStatus(booking, "confirmed")}>{busyIcon ?? <Check size={12}/>}Approve</ActionButton><ActionButton disabled={disabled} tone="red" onClick={() => updateStatus(booking, "rejected")}>{busyIcon ?? <CircleX size={12}/>}Reject</ActionButton></div>;
    if (booking.status === "confirmed") return <ActionButton disabled={disabled} tone="blue" onClick={() => updateStatus(booking, "picked_up")}>{busyIcon ?? <Truck size={12}/>}Mark picked up</ActionButton>;
    if (booking.status === "picked_up") return <ActionButton disabled={disabled} tone="blue" onClick={() => updateStatus(booking, "returned")}>{busyIcon ?? <RotateCcw size={12}/>}Mark returned</ActionButton>;
    if (booking.status === "returned") return <ActionButton disabled={disabled} tone="blue" onClick={() => updateStatus(booking, "completed")}>{busyIcon ?? <Check size={12}/>}Complete</ActionButton>;
    return null;
  }

  if (!bookings.length) return <div className="rounded-xl border border-[#e7ecf3] bg-white px-6 py-16 text-center"><span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-[#edf2ff] text-[#4c6fc9]"><Check size={20}/></span><h2 className="mt-4 text-sm font-semibold text-[#43536a]">All caught up</h2><p className="mt-1 text-xs text-[#8793a3]">New booking requests will appear here.</p></div>;

  return <div className="space-y-4">{error && <p role="alert" className="rounded-lg border border-[#f1cccc] bg-[#fff6f6] px-3 py-2 text-xs text-[#a13a3a]">{error}</p>}{bookings.map((booking) => <article key={booking.id} className="rounded-xl border border-[#e7ecf3] bg-white p-4 shadow-[0_2px_6px_rgba(20,42,78,.025)] sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold text-[#33445b]">{booking.customer?.full_name || "Customer"}</h2><StatusPill status={booking.status}/></div><p className="mt-1 text-[10px] text-[#8b97a8]">{booking.reference} · Request received {new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric" }).format(new Date(booking.created_at))}</p></div><div className="text-left sm:text-right"><p className="text-[9px] text-[#8b97a8]">Booking total</p><p className="mt-0.5 text-sm font-semibold text-[#33445b]">{formatPeso(Number(booking.total_price))}</p><p className="text-[9px] text-[#8793a3]">Net {formatPeso(Number(booking.owner_earnings))}</p></div></div>
      <div className="mt-4 grid gap-4 border-t border-[#edf0f4] pt-4 sm:grid-cols-3"><div><p className="text-[9px] font-medium uppercase tracking-wide text-[#9aa4b2]">Vehicle</p><p className="mt-1 text-[11px] font-medium text-[#4c5c72]">{booking.car ? `${booking.car.brand} ${booking.car.model}` : "Vehicle"}</p><p className="mt-0.5 text-[9px] text-[#8995a6]">{booking.car?.plate_number || (booking.mode === "self_drive" ? "Self drive" : "With driver")}</p></div><div><p className="text-[9px] font-medium uppercase tracking-wide text-[#9aa4b2]">Rental dates</p><p className="mt-1 text-[11px] font-medium text-[#4c5c72]">{formatShortDate(booking.start_date)}</p><p className="mt-0.5 text-[9px] text-[#8995a6]">through {formatShortDate(booking.end_date)}</p></div><div><p className="text-[9px] font-medium uppercase tracking-wide text-[#9aa4b2]">Customer contact</p><p className="mt-1 text-[11px] font-medium text-[#4c5c72]">{booking.customer?.phone || "No phone on profile"}</p><p className="mt-0.5 text-[9px] text-[#8995a6] capitalize">Payment {booking.payment}</p></div></div>
      {(booking.pickup_location || booking.pickup_time || booking.itinerary_notes) && <div className="mt-3 rounded-lg bg-[#f8faff] px-3.5 py-3"><p className="text-[9px] font-semibold uppercase tracking-wide text-[#8390a3]">Pickup and itinerary</p><p className="mt-1 text-[10px] text-[#4c5c72]">{[booking.pickup_location, booking.pickup_time ? `Pickup ${booking.pickup_time.slice(0, 5)}` : null].filter(Boolean).join(" · ") || "No pickup details"}</p>{booking.itinerary_notes && <p className="mt-1 whitespace-pre-wrap text-[10px] leading-4 text-[#6c7a8e]">{booking.itinerary_notes}</p>}</div>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#edf0f4] pt-3"><div className="flex flex-wrap items-center gap-2">{actionsFor(booking)}{booking.payment !== "paid" && ["confirmed", "picked_up", "returned", "completed"].includes(booking.status) && <><select aria-label="Payment method" value={paymentMethods[booking.id] ?? "cash"} onChange={(event) => setPaymentMethods((current) => ({ ...current, [booking.id]: event.target.value }))} className="h-8 rounded-lg border border-[#e1e7ef] bg-white px-2 text-[10px] text-[#5e6e83]"><option value="cash">Cash</option><option value="gcash">GCash</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select><ActionButton disabled={busyId === booking.id} tone="green" onClick={() => markPaid(booking)}>{busyId === booking.id ? <LoaderCircle size={12} className="animate-spin"/> : <CircleDollarSign size={13}/>}Mark payment received</ActionButton></>}</div><p className="text-[9px] text-[#98a2b0]">Platform fee {formatPeso(Number(booking.commission_amount))}</p></div>
    </article>)}</div>;
}

function ActionButton({ children, onClick, disabled, tone }: { children: ReactNode; onClick: () => void; disabled: boolean; tone: "blue" | "red" | "green" }) {
  const styles = { blue: "border-[#dbe4fb] bg-[#f4f7ff] text-[#4568bd] hover:bg-[#eaf0ff]", red: "border-[#f0dddd] bg-white text-[#a14d4d] hover:bg-[#fff6f6]", green: "border-[#d9eade] bg-[#f2f8f4] text-[#3e805d] hover:bg-[#eaf5ed]" };
  return <button onClick={onClick} disabled={disabled} className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-semibold transition disabled:opacity-50 ${styles[tone]}`}>{children}</button>;
}
