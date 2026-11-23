import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { BookingCancellationPolicy } from "@/components/customer/cancellation-policy";
import { BookingStatusChip, BookingStepper } from "@/components/customer/booking-progress";
import { CancelBookingButton, PaymentCountdown } from "@/components/customer/booking-payment-controls";
import { CopyButton } from "@/components/ui/CopyButton";
import { PaymentDisputeButton } from "@/components/customer/payment-dispute-button";
import { PaymentStatusRefresh } from "@/components/customer/payment-status-refresh";
import { PaymentProofForm } from "@/components/customer/payment-proof-form";
import { BookingPaymentConfirmation } from "@/components/customer/payment-confirmation";
import { DisputeList, type Dispute } from "@/components/payment-disputes";
import { customerBookingStatus } from "@/lib/customer-bookings";
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
    .select("id,reference,owner_id,status,mode,start_date,end_date,rental_starts_at,car:cars!bookings_car_id_fkey(brand,model),deposit_amount,payment_due_at,payment_resubmit_due_at,review_due_at,amount_due_now,balance_at_pickup,total_price,cancel_free_until,cancel_fee_percent,amount_paid_online")
    .eq("id", id).eq("customer_id", user.id).maybeSingle();
  if (!booking) notFound();
  const [{ data: proofs, error: proofError }, { data: receipt }, { data: disputes }, { data: pickup }, { data: refund }] = await Promise.all([
    db.from("payments").select("paid_at,status,method,rejection_reason,amount,reference_no").eq("booking_id", id).eq("method", "owner_qr").order("paid_at", { ascending: false }),
    db.from("payment_receipts").select("id,receipt_no,public_code,status,created_at,details").eq("booking_id", id).maybeSingle<Receipt>(),
    db.from("customer_payment_disputes").select("*").eq("booking_id", id).order("created_at").returns<Dispute[]>(),
    db.rpc("customer_booking_pickup", { p_booking_id: id }).maybeSingle<{ pickup_location: string | null; pickup_time: string | null; contact_phone: string | null }>(),
    db.from("booking_refunds").select("status,amount,due_at,refund_reference").eq("booking_id", id).maybeSingle(),
  ]);
  const now = new Date().getTime();
  const deadline = [booking.payment_due_at, booking.payment_resubmit_due_at].filter(Boolean).sort().at(-1);
  const status = customerBookingStatus(booking.status, proofs);
  const confirmed = status === "confirmed";
  const inReview = status === "payment_review";
  const proof = (confirmed ? proofs?.find(payment => payment.status === "verified")
    : inReview ? proofs?.find(payment => payment.status === "pending") : undefined) ?? proofs?.[0];
  const available = !proofError && status === "awaiting_payment" && (!deadline || Date.parse(deadline) > now);
  const reviewDeadline = booking.review_due_at ?? booking.payment_due_at;
  const admin = createAdminClient();
  const { data: owner } = available && admin
    ? await admin.from("owners").select("business_name,payment_method_label,payment_account_name,payment_qr_path,gcash_number")
      .eq("id", booking.owner_id).eq("payment_qr_verified", true).maybeSingle()
    : { data: null };
  const qr = owner?.payment_qr_path && admin
    ? (await admin.storage.from("owner-qr").createSignedUrl(owner.payment_qr_path, 300)).data?.signedUrl
    : null;
  const paymentDispute = inReview || (status === "awaiting_payment" && !proofError && (!available || proof?.status === "rejected")) || status === "expired";
  const refundDispute = refund?.status === "refunded";
  const hasDispute = (kind: string) => disputes?.some((dispute) => dispute.kind === kind && dispute.status === "open");

  const mobileCard = "mt-4 min-w-0 rounded-2xl border border-[#D6E6F7] bg-white p-4 md:hidden";
  const car = Array.isArray(booking.car) ? booking.car[0] : booking.car;
  const phone = pickup?.contact_phone?.replace(/[^+0-9]/g, "");
  const walletDigits = owner?.gcash_number?.replace(/\D/g, "");
  const paid = booking.status !== "confirmed" && proof?.status === "verified" ? proof.amount : booking.amount_paid_online;

  return <main className="mx-auto max-w-2xl px-4 py-8 max-md:font-body max-md:text-[#0F2342]">
    <PaymentStatusRefresh status={status} />
    <Link href="/account/bookings" className="text-sm font-semibold text-blue-800 max-md:inline-flex max-md:min-h-11 max-md:items-center">← My bookings</Link>
    <h1 className="mt-4 text-2xl font-bold max-md:font-heading">{available && !proof ? "Pay your booking deposit" : "Booking payment"}</h1>
    <BookingStepper status={status} />
    <div className="md:hidden"><BookingStatusChip status={status} /></div>
    {(!available || proof) && !inReview && <div className="mt-2 flex flex-wrap items-center gap-2 text-sm md:hidden">
      <span className="break-all">Booking reference · {booking.reference}</span>
      <CopyButton mobileTouch label="Copy reference" value={booking.reference} />
    </div>}
    <div className="mt-2 hidden flex-wrap items-center gap-2 text-sm md:flex">
      <p className="break-all">Booking {booking.reference}{owner?.business_name && ` · ${owner.business_name}`}</p>
      <CopyButton label="Copy reference" value={booking.reference} />
    </div>
    {available && <>
      <section className="mt-4 space-y-2 rounded-2xl bg-[#0A47B1] p-4 text-white md:hidden">
        <h2 className="font-heading font-semibold">Amount to pay</h2>
        <p className="text-3xl font-bold">{paymentPeso(booking.amount_due_now)}</p>
        {deadline && <PaymentCountdown deadline={deadline} now={now} />}
        <CopyButton mobileTouch label="Copy amount" value={Number(booking.amount_due_now).toFixed(2)} />
      </section>
      {!proof && <>
        <section className={mobileCard}>
          <h2 className="font-heading font-semibold">{owner?.payment_method_label || "Owner payment QR"}</h2>
          <p className="mt-2 text-sm">{owner?.payment_account_name || owner?.business_name || "Account name unavailable"}{walletDigits && walletDigits.length >= 4 && ` · •••• ${walletDigits.slice(-4)}`}</p>
          {qr ? <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="Owner payment QR" className="mx-auto my-3 max-h-60 max-w-full rounded-lg object-contain" />
            <a className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#D6E6F7] px-3 text-sm font-semibold text-[#0A3D91]" href={`/account/bookings/${id}/pay/qr`}>Download QR</a>
          </> : <p className="mt-2 text-sm text-[#A12A2A]">The payment QR is unavailable. Contact support before sending money.</p>}
        </section>
        <section className={mobileCard}>
          <h2 className="font-heading font-semibold">How to pay</h2>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-[#5B6F89]">
            <li>Scan the QR or upload the saved image in your e-wallet or bank app.</li>
            <li>Verify the account name and send the exact amount shown above.</li>
            <li>Keep the screenshot and transaction reference, then send your proof below.</li>
          </ol>
          <p className="mt-3 break-all text-sm">Booking reference · {booking.reference}</p>
          <CopyButton mobileTouch label="Copy reference" value={booking.reference} />
        </section>
      </>}
    </>}
    {available && <section className="mt-4 space-y-4 rounded-2xl border bg-white p-4 shadow-sm sm:p-6 max-md:border-[#D6E6F7]">
      {proof?.status === "rejected" && <div className="rounded-lg bg-amber-50 p-3 text-sm">
        <p className="font-semibold">Your proof was rejected</p>
        <p className="break-words">{proof.rejection_reason}</p>
        <p>Check your transfer history before sending any additional payment.</p>
      </div>}
      {!proof && <>
        <p className="hidden text-sm font-medium md:block">Amount to send now</p>
        <div className="hidden flex-wrap items-center gap-3 md:flex">
          <p className="text-3xl font-bold">{paymentPeso(booking.amount_due_now)}</p>
          <CopyButton label="Copy amount" value={Number(booking.amount_due_now).toFixed(2)} />
        </div>
        <div className="hidden rounded-xl bg-blue-50 p-4 text-sm md:block">
          <p className="font-semibold">{owner?.payment_method_label || "Owner payment QR"}</p>
          <p>Account name · {owner?.payment_account_name || "Unavailable"}</p>
          <p className="mt-1">Check that the name matches before sending.</p>
          {qr ? <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="Owner payment QR" className="my-3 max-h-60 max-w-full rounded-lg bg-white object-contain p-2" />
            <a className="inline-flex min-h-11 items-center rounded-lg border bg-white px-3 font-medium text-blue-800" href={`/account/bookings/${id}/pay/qr`}>Download QR</a>
          </> : <p className="mt-2 text-red-800">The payment QR is unavailable. Contact support before sending money.</p>}
        </div>
        <ol className="hidden list-decimal space-y-1 pl-5 text-sm md:block">
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
    {confirmed && <section role="status" className="mt-4 space-y-1 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 max-md:rounded-2xl max-md:bg-[#E3F7EA] max-md:text-[#12703A]">
      <h2 className="font-semibold">Payment confirmed</h2>
      <p>Reservation payment received · {paymentPeso(paid)}</p>
      <p className="hidden md:block">Balance at pickup · {paymentPeso(booking.balance_at_pickup)}</p>
    </section>}
    {["cancelled", "completed", "expired"].includes(booking.status) && <p role="status" className="mt-4 text-sm">This booking is {booking.status}. You can still view its payment and refund records here.</p>}
    {inReview && <section role="status" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-950 max-md:rounded-2xl max-md:bg-[#EAF4FF] max-md:text-[#0A3D91]">
      <h2 className="font-semibold"><span className="md:hidden">Payment sent for review</span><span className="hidden md:inline">The owner is checking your payment</span></h2>
      <p>You will get an email and notification.</p>
      {reviewDeadline && <p className="md:hidden">Review deadline · {paymentDate(reviewDeadline)} Manila time</p>}
      {booking.review_due_at && <p className="hidden md:block">Review deadline · {paymentDate(booking.review_due_at)} Manila time</p>}
    </section>}
    {inReview && <>
      <section className={mobileCard}>
        <h2 className="font-heading font-semibold">What you sent</h2>
        <p className="mt-2 text-sm">Amount · {paymentPeso(proof?.amount ?? booking.amount_due_now)}</p>
        {proof?.reference_no && <p className="mt-1 break-all text-sm">Transaction reference · {proof.reference_no}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm"><span className="break-all">Booking reference · {booking.reference}</span><CopyButton mobileTouch label="Copy reference" value={booking.reference} /></div>
      </section>
    </>}
    {confirmed && <>
      <section className={mobileCard}>
        <h2 className="font-heading font-semibold">Your trip</h2>
        {car && <p className="mt-2 font-semibold">{car.brand} {car.model}</p>}
        <p className="mt-1 text-sm">{booking.start_date} to {booking.end_date}</p>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-2"><dt>Reservation paid</dt><dd>{paymentPeso(paid)}</dd></div>
          <div className="flex justify-between gap-2"><dt>Balance at pickup</dt><dd>{paymentPeso(booking.balance_at_pickup)}</dd></div>
          {booking.mode === "self_drive" && booking.deposit_amount > 0 && <div className="flex justify-between gap-2"><dt>Refundable safety deposit</dt><dd>{paymentPeso(booking.deposit_amount)}</dd></div>}
        </dl>
      </section>
      <section className={mobileCard}>
        <h2 className="font-heading font-semibold">Pickup</h2>
        <p className="mt-2 break-words text-sm">{pickup?.pickup_location || "Arrange pickup with the rental owner"}{pickup?.pickup_time && ` · ${pickup.pickup_time.slice(0, 5)} Manila time`}</p>
        <p className="mt-2 text-sm text-[#5B6F89]">Bring your government ID{booking.mode === "self_drive" && " and driver’s license"}.</p>
        <div className="flex flex-wrap gap-x-4">
          {phone && <a className="inline-flex min-h-11 items-center text-sm font-semibold text-[#0A3D91] underline" href={`sms:${phone}`}>Message owner</a>}
          {pickup?.pickup_location && <a className="inline-flex min-h-11 items-center text-sm font-semibold text-[#0A3D91] underline" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pickup.pickup_location)}`}>Directions</a>}
        </div>
      </section>
      {booking.status === "confirmed" && <Link prefetch={false} href={`/account/bookings/${id}/pickup`} className="mt-4 flex h-[52px] items-center justify-center rounded-full bg-[#0A47B1] px-4 text-sm font-semibold text-white md:hidden">Show my pickup pass</Link>}
      {receipt?.status === "valid" && <a href={`/api/receipts/${receipt.id}/pdf`} download className="mt-2 flex min-h-11 items-center justify-center rounded-full border border-[#D6E6F7] text-sm font-semibold text-[#0A3D91] md:hidden">Download receipt</a>}
    </>}
    {["awaiting_payment", "payment_review", "confirmed"].includes(booking.status) && booking.rental_starts_at
      && now < Date.parse(booking.rental_starts_at) && <CancelBookingButton id={id} reference={booking.reference} />}
    {!available && status === "awaiting_payment" && <p role="status" className="mt-4 text-sm">{proofError ? "We couldn’t check your payment status. Please try again in a moment." : "The payment window has passed."}</p>}
    {pickup && <section className={`mt-4 rounded-xl border bg-white p-4 text-sm ${confirmed ? "hidden md:block" : ""}`}>
      <h2 className="font-semibold">Pickup details</h2>
      <p>{pickup.pickup_location || "Arrange pickup with the rental owner"}{pickup.pickup_time && ` · ${pickup.pickup_time.slice(0, 5)} Manila time`}</p>
      {pickup.contact_phone && <p>Owner contact · <a className="text-blue-800 underline" href={`tel:${pickup.contact_phone.replace(/[^+0-9]/g, "")}`}>{pickup.contact_phone}</a></p>}
    </section>}
    {receipt && <div className={confirmed && receipt.status === "valid" ? "hidden md:contents" : "contents"}><BookingPaymentConfirmation receipt={receipt} /></div>}
    {refund && <section className="mt-4 space-y-1 rounded-xl border bg-white p-4 text-sm">
      <h2 className="font-semibold">Refund · {paymentPeso(refund.amount)}</h2>
      <p className="capitalize">{refund.status}{refund.status === "owed" && ` · Due ${paymentDate(refund.due_at)} Manila time`}</p>
      {refund.refund_reference && <p className="break-words">Refund reference · {refund.refund_reference}</p>}
      {refundDispute && !hasDispute("refund_not_received") && <PaymentDisputeButton bookingId={id} kind="refund_not_received" />}
    </section>}
    {paymentDispute && !hasDispute("paid_not_confirmed") && <>
      <div className={inReview ? "hidden md:contents" : "contents"}><PaymentDisputeButton bookingId={id} kind="paid_not_confirmed"
        availableAt={inReview && proof?.paid_at ? new Date(Date.parse(proof.paid_at) + 7_200_000).toISOString() : undefined} /></div>
      {inReview && reviewDeadline && Date.parse(reviewDeadline) <= now && <section className={mobileCard}>
        <h2 className="font-heading font-semibold">Owner not responding?</h2>
        <PaymentDisputeButton bookingId={id} kind="paid_not_confirmed" />
      </section>}
    </>}
    {receipt?.status === "valid" && !hasDispute("wrong_amount") && <div><PaymentDisputeButton bookingId={id} kind="wrong_amount" /></div>}
    <DisputeList disputes={disputes ?? []} role="customer" />
    <Link href={`/contact?topic=payment&ref=${encodeURIComponent(booking.reference)}`} className="mt-5 inline-block text-sm font-semibold text-blue-800 underline">Need help with this payment?</Link>
  </main>;
}
