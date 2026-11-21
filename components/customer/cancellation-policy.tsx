import { formatCutoff, refundMoney, refundOwnerCopy, refundSupportCopy, type CancellationSnapshot } from "@/lib/cancellation";

export function BookingCancellationPolicy({ booking, now }: { booking: CancellationSnapshot; now: number }) {
  if (!booking.cancel_free_until || booking.cancel_fee_percent === null) return null;
  const late = now > Date.parse(booking.cancel_free_until);
  return <div className="space-y-1 text-sm">
    <p>Free cancellation until {formatCutoff(booking.cancel_free_until)}</p>
    <p>{late && Number(booking.amount_paid_online) > 0
      ? `Cancelling now keeps ${booking.cancel_fee_percent}% of your reservation payment.`
      : `After the cutoff, the owner keeps ${booking.cancel_fee_percent}% of your verified reservation payment.`}</p>
    <p>{refundOwnerCopy}</p>
  </div>;
}

export function BookingRefundStatus({ status, amount, days }: { status: string; amount: number; days: number }) {
  if (status !== "owed" && status !== "refunded") return null;
  return <section className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
    <h3 className="font-semibold">{status === "owed" ? "Refund pending (owner sends it)" : "Refunded"}{amount > 0 && ` · ${refundMoney(amount)}`}</h3>
    <p>{refundOwnerCopy}</p>
    {status === "owed" && <p>{refundSupportCopy(days)}</p>}
  </section>;
}
