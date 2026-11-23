"use client";

import { CopyButton } from "@/components/ui/CopyButton";
import { BookingStatusChip } from "@/components/customer/booking-progress";

import { paymentDate, paymentPeso } from "@/lib/payment-format";
import { cancelWithPreview } from "@/lib/cancellation-dialog";
import { cancellableStatuses, refundMoney, type CancellationSnapshot } from "@/lib/cancellation";
import { BookingCancellationPolicy, BookingRefundStatus } from "@/components/customer/cancellation-policy";
import { useRef, useState } from "react";
import { ReviewDialog } from "@/components/reviews/ReviewDialog";
import { Rating } from "@/components/reviews/ReviewContent";
import type { MyReview } from "@/lib/reviews/model";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarDays, CarFront, CircleCheck, CircleX, Clock3, LoaderCircle, MapPin, RotateCw } from "lucide-react";

export type CustomerBooking = CancellationSnapshot & {
  rental_starts_at: string | null;
  refund_amount: number;
  refund?: { status: string; amount: number; due_at: string };
  cancel_fee_amount: number;
  deposit_refund_status: string;
  id: string;
  reference: string;
  review?: MyReview;
  reviewable?: boolean;
  editable?: boolean;
  pickupPassReady: boolean;
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

const filters = ["All", "Upcoming", "Past"] as const;
const pastStatuses = ["returned", "completed", "cancelled", "rejected", "expired"];

export function BookingList({ bookings, now, supportDays, reviewTarget, showFilters }: { bookings: CustomerBooking[]; now: number; supportDays: number; reviewTarget?: string; showFilters: boolean }) {
  const router = useRouter();
  const initial = bookings.find(booking => booking.id === reviewTarget && booking.reviewable);
  const [activeReview, setActiveReview] = useState<{ booking: string; review?: MyReview } | null>(
    initial ? { booking: initial.id } : null);
  const openedBy = useRef<HTMLButtonElement>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  function matchesFilter(booking: CustomerBooking) {
    return filter === "All" || pastStatuses.includes(booking.status) === (filter === "Past");
  }

  function cancelBooking(booking: CustomerBooking) {
    return cancelWithPreview({ booking, customer: true, refresh: router.refresh,
      setPending: pending => setCancellingId(pending ? booking.id : null) });
  }

  if (!bookings.length) return <div className="rounded-2xl border border-[#e3e8ef] bg-white px-6 py-14 text-center shadow-sm"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#edf2ff] text-[#4d71cc]"><CalendarDays size={21}/></span><h2 className="mt-4 text-base font-semibold text-[#34445b]">No bookings yet</h2><p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-[#7d8998]">When you book a vehicle, you’ll find the schedule, status, and rental details here.</p><Link href="/" className="mt-5 inline-flex h-9 items-center rounded-lg bg-[#2457d6] px-4 text-xs font-semibold text-white hover:bg-[#1d4ed8]">Browse rentals</Link></div>;

  return <div className="space-y-4">
    {showFilters && <div role="group" aria-label="Filter bookings" className="flex flex-wrap gap-2 md:hidden">
      {filters.map(option => <button key={option} type="button" aria-pressed={filter === option} onClick={() => setFilter(option)}
        className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${filter === option ? "border-[#0A47B1] bg-[#0A47B1] text-white" : "border-[#D6E6F7] bg-white text-[#0A3D91]"}`}>{option}</button>)}
    </div>}
    {!bookings.some(matchesFilter) && <p className="rounded-2xl border border-[#D6E6F7] bg-white p-4 text-sm text-[#5B6F89] md:hidden">No {filter.toLowerCase()} bookings.</p>}
    {bookings.map((booking) => {
    const cancelAllowed = cancellableStatuses.includes(booking.status) && !!booking.rental_starts_at && now < Date.parse(booking.rental_starts_at);
    const payHref = `/account/bookings/${booking.id}/pay`;
    const pickupHref = `/account/bookings/${booking.id}/pickup`;
    const vehicle = booking.car ? `${booking.car.brand} ${booking.car.model}` : "Vehicle";
    const dates = `${formatDate(booking.start_date)} – ${formatDate(booking.end_date)}`;
    function openReview(event: React.MouseEvent<HTMLButtonElement>) {
      openedBy.current = event.currentTarget;
      setActiveReview({ booking: booking.id, review: booking.review });
    }
    const actionClass = "inline-flex min-h-11 shrink-0 items-center rounded-full bg-[#EAF4FF] px-3 text-sm font-semibold text-[#0A3D91]";
    return <article id={`trip-${booking.id}`} key={booking.id} className={`overflow-hidden rounded-2xl border border-[#e3e8ef] bg-white shadow-sm ${matchesFilter(booking) ? "" : "hidden md:block"}`}>
      <div className="space-y-2 p-4 text-[#0F2342] md:hidden">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="min-w-0 break-words font-heading font-bold">
            {["payment_review", "confirmed", "picked_up", "expired"].includes(booking.status) || booking.refund
              ? <Link prefetch={booking.status === "picked_up" ? false : undefined} className="inline-flex min-h-11 items-center underline decoration-[#D6E6F7] underline-offset-4" href={booking.status === "picked_up" ? pickupHref : payHref}>{vehicle}</Link> : vehicle}
          </h3>
          <BookingStatusChip status={booking.status} />
        </div>
        <p className="text-sm text-[#5B6F89]">{dates}</p>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
            <span className="break-all font-semibold">{booking.reference}</span>
            <CopyButton mobileTouch value={booking.reference} label="Copy reference" />
          </div>
          {booking.status === "awaiting_payment" && <Link href={payHref} className={actionClass}>Pay {paymentPeso(booking.amount_due_now)} →</Link>}
          {booking.pickupPassReady && <Link href={pickupHref} prefetch={false} className={actionClass}>Pickup pass →</Link>}
          {booking.reviewable && (booking.status === "completed" || !showFilters) && <button type="button" className={actionClass} onClick={openReview}>Rate trip →</button>}
          {!showFilters && booking.editable && <button type="button" className={actionClass} onClick={openReview}>Edit review</button>}
        </div>
        {!showFilters && booking.review && <div className="space-y-1 border-t border-[#E3EEF9] pt-3 text-sm">
          <Rating rating={booking.review.rating} />
          {booking.review.is_hidden && <p className="text-amber-800">This review was hidden by moderators.</p>}
          {booking.review.comment && <p className="whitespace-pre-wrap break-words">{booking.review.comment}</p>}
          {booking.review.owner_reply && <p className="whitespace-pre-wrap break-words border-l-2 pl-2">Owner reply: {booking.review.owner_reply}</p>}
        </div>}
      </div>
      <div className="hidden md:contents">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0f4] px-4 py-3.5 sm:px-5"><div><p className="text-[10px] font-medium uppercase tracking-wide text-[#8b97a7]">Booking reference</p><div className="mt-0.5 flex flex-wrap items-center gap-2"><p className="text-xs font-semibold text-[#43536a]">{booking.reference}</p><CopyButton value={booking.reference} label="Copy reference" /></div></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize ${statusStyles[booking.status] ?? "bg-[#f2f4f7] text-[#68778c]"}`}>{booking.status.replaceAll("_", " ")}</span></div>
      <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5"><div className="flex min-w-0 gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f1f4fa] text-[#5e75a8]"><CarFront size={21}/></span><div className="min-w-0"><h2 className="truncate text-sm font-semibold text-[#2d3e55]">{booking.car ? `${booking.car.year ? `${booking.car.year} ` : ""}${booking.car.brand} ${booking.car.model}` : "Rental vehicle"}</h2><p className="mt-1 text-[11px] text-[#7d8998]">{booking.mode === "self_drive" ? "Self drive" : "With driver"}{booking.car?.car_type ? ` · ${booking.car.car_type}` : ""}</p><div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-[#637188]"><span className="inline-flex items-center gap-1.5"><CalendarDays size={12} className="text-[#7890ca]"/>{formatDate(booking.start_date)} – {formatDate(booking.end_date)}</span><span className="inline-flex items-center gap-1.5"><MapPin size={12} className="text-[#7890ca]"/>{booking.pickup_location || "Pickup location to be confirmed"}{booking.pickup_time ? ` · ${booking.pickup_time.slice(0, 5)}` : ""}</span></div>{booking.itinerary_notes && <p className="mt-2 whitespace-pre-wrap text-[10px] leading-4 text-[#637188]">Itinerary: {booking.itinerary_notes}</p>}</div></div>
        <div className="flex items-center justify-between gap-4 border-t border-[#edf0f4] pt-3 sm:block sm:border-0 sm:pt-0 sm:text-right"><div><p className="text-[10px] text-[#8995a5]">Rental total</p><p className="mt-0.5 text-sm font-semibold text-[#2d3e55]">{formatPrice(Number(booking.total_price))}</p><p className="mt-0.5 text-[10px] text-[#8995a5]">{formatPrice(Number(booking.daily_rate))} / day · {booking.payment}</p></div>{cancelAllowed ? <button onClick={() => cancelBooking(booking)} disabled={cancellingId === booking.id} className="mt-2 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#eadede] px-3 text-[10px] font-semibold text-[#9a4b4b] transition hover:bg-[#fff6f6] disabled:opacity-60">{cancellingId === booking.id ? <LoaderCircle size={12} className="animate-spin"/> : <CircleX size={12}/>}Cancel booking</button> : <p className="mt-2 inline-flex items-center gap-1 text-[10px] text-[#8995a5]">{booking.status === "completed" ? <CircleCheck size={12}/> : <Clock3 size={12}/>} {booking.status === "completed" ? "Rental completed" : "Cancellation unavailable"}</p>}</div>
      </div>
      {(cancelAllowed || Number(booking.cancel_fee_amount) > 0 || booking.refund || ["owed", "refunded"].includes(booking.deposit_refund_status)) && <div className="space-y-2 border-t px-4 py-3">
        {cancelAllowed && <BookingCancellationPolicy booking={booking} now={now}/>}
        {Number(booking.cancel_fee_amount) > 0 && <p className="text-sm">Cancellation fee kept by the owner · {refundMoney(Number(booking.cancel_fee_amount))}</p>}
        {booking.refund ? <p className="text-sm font-medium">Refund · {paymentPeso(booking.refund.amount)} · {booking.refund.status}
          {booking.refund.status === "owed" && ` · Due ${paymentDate(booking.refund.due_at)} Manila time`}</p>
          : <BookingRefundStatus status={booking.deposit_refund_status} amount={Number(booking.refund_amount)} days={supportDays}/>}
      </div>}
      {(booking.pickupPassReady || booking.status === "picked_up") && <div className="border-t px-4 py-2">
        <Link prefetch={false} href={pickupHref}
          className={`inline-flex min-h-11 items-center rounded-lg border px-3 text-sm font-semibold ${booking.start_date === new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date(now)) ? "border-blue-700 bg-blue-700 text-white" : "text-blue-800"}`}>
          Pickup pass
        </Link>
      </div>}
      {(booking.refund || !["pending", "rejected"].includes(booking.status)) && <div className="border-t px-4 py-3">
        <Link href={`/account/bookings/${booking.id}/pay`} className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-800 underline">
          {booking.status === "awaiting_payment" ? "Pay or upload proof" : "View payment details"}
        </Link>
      </div>}
      {(booking.review || booking.reviewable) && <div className="space-y-2 border-t px-4 py-3 text-sm">
        {booking.review && <>
          <p>Your review <Rating rating={booking.review.rating}/></p>
          {booking.review.is_hidden && <p className="text-amber-800">This review was hidden by moderators.</p>}
          {booking.review.comment && <p className="whitespace-pre-wrap break-words">{booking.review.comment}</p>}
          {booking.review.owner_reply && <p className="border-l-2 pl-2 whitespace-pre-wrap break-words">Owner reply: {booking.review.owner_reply}</p>}
        </>}
        {(booking.reviewable || booking.editable) && <button className="rounded-lg border px-3 py-2 font-semibold text-blue-800"
          onClick={openReview}>{booking.review ? "Edit review" : "Rate your trip"}</button>}
      </div>}
      <div className="border-t border-[#edf0f4] px-4 py-2.5 text-right sm:px-5"><Link href={`/contact?topic=booking&ref=${encodeURIComponent(booking.reference)}`} className="text-[11px] font-medium text-[#2457d6] underline">Need help with this booking?</Link></div>
      </div>
    </article>;
  })}{activeReview && <ReviewDialog booking={activeReview.booking} trip={bookings.find(booking => booking.id === activeReview.booking)} review={activeReview.review} saved={router.refresh}
    close={() => {
      setActiveReview(null);
      requestAnimationFrame(() => openedBy.current?.focus());
    }}/>}<div className="hidden items-center gap-2 px-1 text-[10px] leading-5 text-[#8b97a7] md:flex"><RotateCw size={12}/>Booking status updates as your rental progresses.</div></div>;
}
