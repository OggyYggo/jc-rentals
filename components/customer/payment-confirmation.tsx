import Link from "next/link";
import { paymentDate, paymentPeso, safetyDepositCopy } from "@/lib/payment-format";
import { confirmationFooter, receiptStatuses, type Receipt } from "@/lib/payment-receipt";

export function BookingPaymentConfirmation({ receipt }: { receipt: Receipt }) {
  const d = receipt.details;
  const fields = [
    ["Confirmation number", receipt.receipt_no], ["Status", receiptStatuses[receipt.status]],
    ["Booking reference", d.booking_reference], ["Vehicle", d.vehicle],
    ["Rental dates", `${d.start_date} to ${d.end_date}`], ["Mode", d.mode === "self_drive" ? "Self-drive" : "With driver"],
    ["Pickup", d.pickup || "Arrange with the rental owner"], ["Rental business", d.owner_name], ["Customer", d.customer_name],
    ["Payment channel", d.channel], ["Confirmed (Manila)", paymentDate(receipt.created_at)],
    ["Reservation deposit paid", paymentPeso(d.amount)], ["Balance due at pickup", paymentPeso(d.balance)],
  ];
  if (d.safety_deposit !== null) fields.push(["Safety deposit", `${paymentPeso(d.safety_deposit)}. ${safetyDepositCopy}`]);

  return <section className="mt-4 rounded-xl border bg-white p-4">
    <h2 className="text-lg font-semibold">Booking Payment Confirmation</h2>
    <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
      {fields.map(([label, value]) => <div key={label} className="min-w-0 break-words"><dt className="font-semibold">{label}</dt><dd>{value}</dd></div>)}
    </dl>
    <p className="mt-4 text-sm text-slate-600">{confirmationFooter}</p>
    <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold text-blue-800">
      <a className="inline-flex min-h-11 items-center underline" href={`/api/receipts/${receipt.id}/pdf`}>Open PDF</a>
      <Link prefetch={false} className="inline-flex min-h-11 items-center underline" href={`/receipt/${receipt.public_code}`}>Verify confirmation</Link>
    </div>
  </section>;
}
