"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { runWithAlerts } from "@/lib/alerts/run";
import { refundMoney, refundOwnerCopy } from "@/lib/cancellation";
import { createClient } from "@/lib/supabase/client";

export type RefundBooking = {
  id: string;
  reference: string;
  cancelled_at: string | null;
  refund_amount: number;
  deposit_refund_status: string;
  customer: { full_name: string } | null;
  owner?: { business_name: string } | null;
};

export function RefundQueue({ bookings, now }: { bookings: RefundBooking[]; now: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const owed = bookings.filter(booking => booking.deposit_refund_status === "owed");

  function markRefunded(booking: RefundBooking) {
    const amount = Number(booking.refund_amount);
    return runWithAlerts({
      reason: {
        title: `Mark refund sent for ${booking.reference}?`,
        text: (amount > 0 ? `Confirm you sent ${refundMoney(amount)}. ` : "Verify the original transfer and the amount sent. ") + refundOwnerCopy,
        label: "Refund reference (optional)", required: false, minLength: 0, maxLength: 80, confirmText: "Mark as refunded",
      },
      setPending: pending => setBusy(pending ? booking.id : null),
      run: async reference => {
        const { error } = await createClient().rpc("mark_deposit_refunded", { p_booking_id: booking.id, p_reference: reference || null });
        if (error) throw error;
      },
      success: "Refund recorded",
      refresh: router.refresh,
    });
  }

  return <section id="refunds" className="mb-5 scroll-mt-20 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
    <h2 className="font-semibold">Refunds to send</h2>
    <p className="text-sm text-slate-600">{owed.length ? refundOwnerCopy : "No refunds pending."}</p>
    <ul className="divide-y divide-slate-100">
      {owed.map(booking => {
        const hours = booking.cancelled_at ? Math.max(0, Math.floor((now - Date.parse(booking.cancelled_at)) / 3_600_000)) : null;
        return <li key={booking.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
          <div className="min-w-0 space-y-1">
            <p className="break-words font-medium">{booking.reference} · {booking.customer?.full_name ?? "Customer"}{booking.owner && ` · ${booking.owner.business_name}`}</p>
            <p>{Number(booking.refund_amount) > 0 ? refundMoney(Number(booking.refund_amount)) : "Verify transferred amount"}
              {hours !== null && ` · ${hours >= 24 ? Math.floor(hours / 24) + "d" : hours + "h"} since cancellation`}</p>
            {hours !== null && hours >= 72 && <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">Overdue</span>}
          </div>
          <button type="button" disabled={busy !== null} onClick={() => markRefunded(booking)}
            className="rounded-lg border border-emerald-200 px-3 py-2 text-emerald-800 disabled:opacity-50">
            {busy === booking.id ? "Recording…" : "Mark as refunded"}
          </button>
        </li>;
      })}
    </ul>
  </section>;
}
