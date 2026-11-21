import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { BookingCancellationPolicy } from "@/components/customer/cancellation-policy";
import { PaymentCopyButton } from "@/components/customer/payment-copy-button";
import { PaymentDisputeButton } from "@/components/customer/payment-dispute-button";
import { PaymentStatusRefresh } from "@/components/customer/payment-status-refresh";
import { PaymentProofForm } from "@/components/customer/payment-proof-form";
import { BookingPaymentConfirmation } from "@/components/customer/payment-confirmation";
import { DisputeList, type Dispute } from "@/components/payment-disputes";
import { paymentDate, paymentPeso, safetyDepositCopy } from "@/lib/payment-format";
import type { Receipt } from "@/lib/payment-receipt";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function BookingPayPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data: booking } = await db.from("bookings")
    .select("id,reference,owner_id,status,mode,deposit_amount,payment_due_at,payment_resubmit_due_at,review_due_at,amount_due_now,balance_at_pickup,total_price,cancel_free_until,cancel_fee_percent,amount_paid_online")
    .eq("id", id).eq("customer_id", user.id).maybeSingle();
  if (!booking) notFound();
  const [{ data: proof }, { data: receipt }, { data: disputes }, { data: pickup }, { data: refund }] = await Promise.all([
    db.from("payments").select("paid_at,status,rejection_reason").eq("booking_id", id).eq("method", "owner_qr").order("paid_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("payment_receipts").select("id,receipt_no,public_code,status,created_at,details").eq("booking_id", id).maybeSingle<Receipt>(),
    db.from("customer_payment_disputes").select("*").eq("booking_id", id).order("created_at").returns<Dispute[]>(),
    db.rpc("customer_booking_pickup", { p_booking_id: id }).maybeSingle<{ pickup_location: string | null; pickup_time: string | null; contact_phone: string | null }>(),
    db.from("booking_refunds").select("status,amount,due_at,refund_reference").eq("booking_id", id).maybeSingle(),
  ]);
  const now = new Date().getTime();
  const deadline = [booking.payment_due_at, booking.payment_resubmit_due_at].filter(Boolean).sort().at(-1);
  const available = booking.status === "awaiting_payment" && (!deadline || Date.parse(deadline) > now);
  const admin = createAdminClient();
  const { data: owner } = available && admin
    ? await admin.from("owners").select("business_name,payment_method_label,payment_account_name,payment_qr_path")
      .eq("id", booking.owner_id).eq("payment_qr_verified", true).maybeSingle()
    : { data: null };
  const qr = owner?.payment_qr_path && admin
    ? (await admin.storage.from("owner-qr").createSignedUrl(owner.payment_qr_path, 300)).data?.signedUrl
    : null;
  const inReview = booking.status === "payment_review";
  const paymentDispute = inReview || (booking.status === "awaiting_payment" && (!available || proof?.status === "rejected")) || booking.status === "expired";
  const refundDispute = refund?.status === "refunded";
  const hasDispute = (kind: string) => disputes?.some((dispute) => dispute.kind === kind && dispute.status === "open");

  return <main className="mx-auto max-w-2xl px-4 py-8">
    <PaymentStatusRefresh status={booking.status} />
    <Link href="/account/bookings" className="text-sm font-semibold text-blue-800">← My bookings</Link>
    <h1 className="mt-4 text-2xl font-bold">{available && !proof ? "Pay your booking deposit" : "Booking payment"}</h1>
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
      <p className="break-all">Booking {booking.reference}{owner?.business_name && ` · ${owner.business_name}`}</p>
      <PaymentCopyButton label="Copy reference" value={booking.reference} />
    </div>
    {available && <section className="mt-4 space-y-4 rounded-2xl border bg-white p-4 shadow-sm sm:p-6">
      {proof?.status === "rejected" && <div className="rounded-lg bg-amber-50 p-3 text-sm">
        <p className="font-semibold">Your proof was rejected</p>
        <p className="break-words">{proof.rejection_reason}</p>
        <p>Check your transfer history before sending any additional payment.</p>
      </div>}
      {!proof && <>
        <p className="text-sm font-medium">Amount to send now</p>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-3xl font-bold">{paymentPeso(booking.amount_due_now)}</p>
          <PaymentCopyButton label="Copy amount" value={Number(booking.amount_due_now).toFixed(2)} />
        </div>
        <div className="rounded-xl bg-blue-50 p-4 text-sm">
          <p className="font-semibold">{owner?.payment_method_label || "Owner payment QR"}</p>
          <p>Account name · {owner?.payment_account_name || "Unavailable"}</p>
          <p className="mt-1">Check that the name matches before sending.</p>
          {qr ? <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="Owner payment QR" className="my-3 max-h-60 max-w-full rounded-lg bg-white object-contain p-2" />
            <a className="inline-flex min-h-11 items-center rounded-lg border bg-white px-3 font-medium text-blue-800" href={`/account/bookings/${id}/pay/qr`}>Download QR</a>
          </> : <p className="mt-2 text-red-800">The payment QR is unavailable. Contact support before sending money.</p>}
        </div>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>Open your e-wallet or bank app and choose Pay QR.</li>
          <li>Scan the QR or upload the saved image.</li>
          <li>Check the account name and enter the exact amount.</li>
          <li>Return here with a screenshot and the wallet or bank transaction reference.</li>
        </ol>
      </>}
      <p className="text-sm">Balance at pickup · {paymentPeso(booking.balance_at_pickup)}</p>
      {deadline && <p className="text-sm">{proof ? "Resubmit by" : "Pay and upload proof by"} {paymentDate(deadline)} Manila time</p>}
      {booking.mode === "self_drive" && <p className="text-sm">Safety deposit · {paymentPeso(booking.deposit_amount)}. {safetyDepositCopy}</p>}
      <BookingCancellationPolicy booking={booking} now={now} />
      <PaymentProofForm bookingId={id} customerId={user.id} amount={Number(booking.amount_due_now)} />
    </section>}
    {booking.status === "confirmed" && <section role="status" className="mt-4 space-y-1 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
      <h2 className="font-semibold">Payment confirmed</h2>
      <p>Reservation payment received · {paymentPeso(booking.amount_paid_online)}</p>
      <p>Balance at pickup · {paymentPeso(booking.balance_at_pickup)}</p>
    </section>}
    {["cancelled", "completed", "expired"].includes(booking.status) && <p role="status" className="mt-4 text-sm">This booking is {booking.status}. You can still view its payment and refund records here.</p>}
    {inReview && <section className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">
      <h2 className="font-semibold">The owner is checking your payment</h2>
      <p>You will get an email and notification.</p>
      {booking.review_due_at && <p>Review deadline · {paymentDate(booking.review_due_at)} Manila time</p>}
    </section>}
    {!available && booking.status === "awaiting_payment" && <p className="mt-4 text-sm">The payment window has passed.</p>}
    {pickup && <section className="mt-4 rounded-xl border bg-white p-4 text-sm">
      <h2 className="font-semibold">Pickup details</h2>
      <p>{pickup.pickup_location || "Arrange pickup with the rental owner"}{pickup.pickup_time && ` · ${pickup.pickup_time.slice(0, 5)} Manila time`}</p>
      {pickup.contact_phone && <p>Owner contact · <a className="text-blue-800 underline" href={`tel:${pickup.contact_phone.replace(/[^+0-9]/g, "")}`}>{pickup.contact_phone}</a></p>}
    </section>}
    {receipt && <BookingPaymentConfirmation receipt={receipt} />}
    {refund && <section className="mt-4 space-y-1 rounded-xl border bg-white p-4 text-sm">
      <h2 className="font-semibold">Refund · {paymentPeso(refund.amount)}</h2>
      <p className="capitalize">{refund.status}{refund.status === "owed" && ` · Due ${paymentDate(refund.due_at)} Manila time`}</p>
      {refund.refund_reference && <p className="break-words">Refund reference · {refund.refund_reference}</p>}
      {refundDispute && !hasDispute("refund_not_received") && <PaymentDisputeButton bookingId={id} kind="refund_not_received" />}
    </section>}
    {paymentDispute && !hasDispute("paid_not_confirmed") && <PaymentDisputeButton bookingId={id} kind="paid_not_confirmed"
      availableAt={inReview && proof?.paid_at ? new Date(Date.parse(proof.paid_at) + 7_200_000).toISOString() : undefined} />}
    {receipt?.status === "valid" && !hasDispute("wrong_amount") && <div><PaymentDisputeButton bookingId={id} kind="wrong_amount" /></div>}
    <DisputeList disputes={disputes ?? []} role="customer" />
    <Link href={`/contact?topic=payment&ref=${encodeURIComponent(booking.reference)}`} className="mt-5 inline-block text-sm font-semibold text-blue-800 underline">Need help with this payment?</Link>
  </main>;
}
