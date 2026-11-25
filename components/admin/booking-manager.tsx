"use client";

import { runWithAlerts } from "@/lib/alerts/run";
import { createClient } from "@/lib/supabase/client";
import { paymentDate } from "@/lib/payment-format";
import { CopyButton } from "@/components/ui/CopyButton";

import { EntityHistory } from "@/components/admin/audit/EntityHistory";

import { cancelWithPreview } from "@/lib/cancellation-dialog";
import { formatCutoff, refundMoney } from "@/lib/cancellation";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AdminFilterChips, AdminStatus, adminMoney, mobileCard, peso } from "@/components/admin/ui";

export type AdminBooking = { cancellation_policy_version: string | null; cancellation_policy_accepted_at: string | null; refund_amount: number; cancel_free_until: string | null; cancel_fee_percent: number | null; cancelled_by_role: string | null; canceller: { full_name: string } | null; cancel_kind: string | null; cancel_fee_amount: number; id: string; reference: string; status: string; payment: string; start_date: string; end_date: string; total_price: number; commission_amount: number; created_at: string; customer: { full_name: string; phone: string | null } | null; owner: { business_name: string } | null; car: { brand: string; model: string; plate_number: string | null } | null };

function formatDate(value: string) { return new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Manila" }).format(new Date(value)); }

export function BookingManager({ bookings, initialReference = "" }: { bookings: AdminBooking[]; initialReference?: string }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  function cancelBooking(booking: AdminBooking, mode: "full_refund" | "apply_policy") {
    return cancelWithPreview({ booking, mode, refresh: router.refresh,
      setPending: pending => setBusyId(pending ? booking.id : null) });
  }

  function recoverBooking(booking: AdminBooking, target: "expired" | "completed") {
    return runWithAlerts({
      reason: {
        title: target === "expired" ? "Expire this unpaid booking?" : "Complete this returned booking?",
        text: `Booking ${booking.reference}`,
        label: "Reason for status correction",
        confirmText: target === "expired" ? "Expire booking" : "Complete booking",
      },
      setPending: pending => setBusyId(pending ? booking.id : null),
      run: async reason => {
        const { error } = await createClient().rpc("admin_recover_booking_status", {
          p_booking: booking.id, p_expected: booking.status, p_status: target, p_reason: reason,
        });
        if (error) throw error;
      },
      success: "Booking status corrected",
      refresh: router.refresh,
    });
  }

  const [query, setQuery] = useState(initialReference); const [status, setStatus] = useState("all"); const [month, setMonth] = useState("");
  const statuses = ["pending", "awaiting_payment", "payment_review", "expired", "confirmed", "picked_up", "returned", "completed", "cancelled", "rejected"];
  const matching = useMemo(() => bookings.filter(b => `${b.reference} ${b.customer?.full_name ?? ""} ${b.owner?.business_name ?? ""} ${b.car?.brand ?? ""} ${b.car?.model ?? ""}`.toLowerCase().includes(query.toLowerCase()) && (!month || b.start_date.startsWith(month))), [bookings, query, month]);
  const shown = matching.filter(b => status === "all" || b.status === status);
  const mobileStatuses = ["all", "payment_review", "confirmed", "picked_up", "completed", "cancelled", ...statuses.filter(value => !["payment_review", "confirmed", "picked_up", "completed", "cancelled"].includes(value))];
  function bookingActions(b: AdminBooking) {
    return <>{(["pending", "awaiting_payment"].includes(b.status) && b.payment === "unpaid") && <button type="button" disabled={busyId !== null} onClick={() => recoverBooking(b, "expired")} className="mt-2 block rounded border px-2 py-1 text-blue-800 disabled:opacity-50">Expire unpaid booking</button>}{b.status === "returned" && b.payment === "paid" && <button type="button" disabled={busyId !== null} onClick={() => recoverBooking(b, "completed")} className="mt-2 block rounded border px-2 py-1 text-blue-800 disabled:opacity-50">Complete returned booking</button>}{["awaiting_payment", "payment_review", "confirmed"].includes(b.status) && <button type="button" disabled={busyId !== null} onClick={() => cancelBooking(b, "full_refund")} className="mt-2 block rounded border border-red-200 px-2 py-1 text-red-700 disabled:opacity-50">Full refund</button>}{["awaiting_payment", "payment_review", "confirmed"].includes(b.status) && <button type="button" disabled={busyId !== null} onClick={() => cancelBooking(b, "apply_policy")} className="mt-2 block rounded border border-red-200 px-2 py-1 text-red-700 disabled:opacity-50">Apply policy</button>}{b.cancel_free_until && <p className="mt-1">Free until {formatCutoff(b.cancel_free_until)} · {b.cancel_fee_percent}% fee</p>}{b.cancel_kind && <div className="mt-2"><p className="capitalize">{b.cancel_kind.replaceAll("_", " ")} · {b.cancelled_by_role}</p>{b.canceller?.full_name && <p>{b.canceller.full_name}</p>}<p>Fee {refundMoney(b.cancel_fee_amount)} · Refund {refundMoney(b.refund_amount)}</p></div>}</>;
  }

  return <div className="space-y-4"><Link href="/admin/payments?tab=refunds" className="inline-block rounded-lg border bg-white p-3 text-sm font-semibold">View refund queue</Link><div className="flex flex-wrap gap-3"><input value={query} onChange={e => setQuery(e.target.value)} aria-label="Search bookings" placeholder="Search reference, customer, owner, car..." className="h-9 w-full max-w-sm rounded-lg border border-[#dfe5ec] px-3 text-xs outline-none focus:border-[#94a9e9]"/><select aria-label="Booking status" value={status} onChange={e => setStatus(e.target.value)} className="h-9 rounded-lg border border-[#dfe5ec] bg-white px-3 text-xs max-lg:hidden"><option value="all">All statuses</option>{statuses.map(s => <option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}</select><input aria-label="Booking month" type="month" value={month} onChange={e => setMonth(e.target.value)} className="h-9 rounded-lg border border-[#dfe5ec] bg-white px-3 text-xs"/></div><div className="lg:hidden"><AdminFilterChips label="Booking status" value={status} onChange={setStatus} options={mobileStatuses.map(value => ({ value, label: value === "all" ? "All" : value[0].toUpperCase() + value.slice(1).replaceAll("_", " "), count: matching.filter(row => value === "all" || row.status === value).length }))}/></div><div className="space-y-3 lg:hidden">
      {shown.map(b => <article key={b.id} className={mobileCard}>
        <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="break-words font-semibold">{b.reference}</h2><AdminStatus status={b.status}/></div>
        <p className="mt-1">{b.customer?.full_name || "Customer"}{b.car && ` · ${b.car.brand} ${b.car.model}`}</p>
        <p className="mt-1 text-[#5B6F89]">{b.owner?.business_name || "Unassigned"}</p>
        <p className="mt-2 flex flex-wrap justify-between gap-2"><span>{b.start_date} to {b.end_date}</span><strong>{adminMoney(Number(b.total_price))}</strong></p>
        <details className="mt-3 border-t border-[#E3EEF9]">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 font-semibold text-[#0A47B1]">Booking details <span aria-hidden>⌄</span></summary>
          <div className="space-y-2 pb-1 text-[13px] text-[#5B6F89]">
            <p>Created {formatDate(b.created_at)} · Payment {b.payment}</p>
            {b.customer?.phone && <p>{b.customer.phone}</p>}
            {b.car?.plate_number && <p>Plate {b.car.plate_number}</p>}
            <p>Commission {adminMoney(Number(b.commission_amount))}</p>
            {b.cancellation_policy_accepted_at && <p>Policy {b.cancellation_policy_version} accepted {paymentDate(b.cancellation_policy_accepted_at)} Manila time</p>}
            <div className="flex flex-wrap items-center gap-x-3"><CopyButton value={b.reference} label="Copy reference"/><Link href={`/admin/bookings/${b.id}/pickup`} className="inline-flex min-h-11 items-center text-blue-800 underline">Pickup activity</Link></div>
            {bookingActions(b)}
            <EntityHistory entity="booking" id={b.id}/>
          </div>
        </details>
      </article>)}
      {!shown.length && <p className={mobileCard}>No bookings match these filters.</p>}
    </div><div className="hidden overflow-x-auto rounded-xl border border-[#e7ecf3] bg-white lg:block"><table className="w-full min-w-[1050px] text-left text-xs"><thead className="bg-[#f9fafc] text-[9px] uppercase text-[#8d99aa]"><tr>{["Booking", "Customer", "Owner / vehicle", "Dates", "Gross", "Commission", "Payment", "Status"].map(x => <th key={x} className="px-3 py-3">{x}</th>)}</tr></thead><tbody className="divide-y divide-[#f0f2f6]">{shown.map(b => <tr id={`record-${b.id}`} key={b.id} className="text-[#68778c]"><td className="px-3 py-3"><p className="font-semibold text-[#43536a]">{b.reference}</p><CopyButton value={b.reference} label="Copy reference" /><EntityHistory entity="booking" id={b.id}/><Link href={`/admin/bookings/${b.id}/pickup`} className="mt-1 block text-blue-800 underline">Pickup activity</Link><p className="text-[10px]">{formatDate(b.created_at)}</p>{b.cancellation_policy_accepted_at && <p className="mt-1 text-[10px]">Policy {b.cancellation_policy_version} accepted {paymentDate(b.cancellation_policy_accepted_at)} Manila time</p>}</td><td className="px-3 py-3">{b.customer?.full_name || "Customer"}<p className="text-[10px]">{b.customer?.phone}</p></td><td className="px-3 py-3">{b.owner?.business_name || "—"}<p className="text-[10px]">{b.car ? `${b.car.brand} ${b.car.model} · ${b.car.plate_number || "No plate"}` : "—"}</p></td><td data-label="Dates" className="px-3 py-3">{b.start_date}<p className="text-[10px]">to {b.end_date}</p></td><td data-label="Total" className="px-3 py-3">{peso(Number(b.total_price))}</td><td data-label="Commission" className="px-3 py-3">{peso(Number(b.commission_amount))}</td><td data-label="Payment" className="px-3 py-3 capitalize">{b.payment}</td><td className="px-3 py-3"><AdminStatus status={b.status}/>{bookingActions(b)}</td></tr>)}</tbody></table>{!shown.length && <p className="p-8 text-center text-xs text-[#8793a3]">No bookings match these filters.</p>}</div><p className="text-[10px] text-[#8793a3]">Showing {shown.length} of {bookings.length} bookings. Date filter uses booking start date.</p></div>;
}
