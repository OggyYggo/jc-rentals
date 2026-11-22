import Link from "next/link";
import { readCancellationSettings } from "@/lib/cancellation-settings";
import { canReviewTrip } from "@/lib/reviews/eligibility";
import type { MyReview } from "@/lib/reviews/model";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { BookingList, type CustomerBooking } from "@/components/customer/booking-list";
import { SupabaseSetupNotice } from "@/components/customer/setup-notice";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/shared";

export const instant = false;

export default async function CustomerBookingsPage({ searchParams }: { searchParams: Promise<{ review?: string | string[]; view?: string | string[] }> }) {
  if (!isSupabaseConfigured()) return <SupabaseSetupNotice />;
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase.from("bookings").select("id, reference, mode, start_date, end_date, daily_rate, total_price, deposit_amount, rental_starts_at, cancel_free_until, cancel_fee_percent, amount_paid_online, cancel_fee_amount, refund_amount, deposit_refund_status, status, payment, created_at, car:cars!bookings_car_id_fkey(brand,model,year,car_type)").eq("customer_id", user.id).order("created_at", { ascending: false });
  if (error) {
    console.error("Customer bookings query failed:", String(error), { message: error.message, code: error.code, details: error.details, hint: error.hint });
    return <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950"><h2 className="font-semibold">Bookings are temporarily unavailable</h2><p className="mt-2 leading-6">The payment database may not be set up yet. An administrator should apply the payment status migration and then rerun the payment QR module migration in Supabase.</p><p className="mt-2 text-xs text-amber-800">If both migrations have already completed, check the Vercel function logs for the bookings query error.</p></div>;
  }

  const { data: reviews, error: reviewError } = await supabase.from("reviews")
    .select("id,booking_id,rating,owner_rating,tags,comment,owner_reply,created_at,edited_at,is_hidden").eq("customer_id", user.id);
  const { data: dates, error: datesError } = await supabase.from("bookings").select("id,status,returned_at,completed_at,owner_id").eq("customer_id", user.id).in("status", ["returned", "completed"]);
  if (reviewError || datesError) console.error("Customer review eligibility query failed:", reviewError ?? datesError);
  const { data: refunds, error: refundError } = await supabase.from("booking_refunds")
    .select("booking_id,amount,status,due_at").eq("customer_id", user.id);
  if (refundError) throw new Error("Could not load booking refunds.");
  const refundsByBooking = new Map((refunds ?? []).map(row => [row.booking_id, row]));
  const byBooking = new Map((reviews ?? []).map(row => [row.booking_id, row as MyReview]));
  const returnedTrips = new Map((dates ?? []).map(row => [row.id, row]));
  const { review: reviewTarget, view } = await searchParams;
  const now = new Date().getTime();
  const { supportDays } = await readCancellationSettings();
  const bookings = (data ?? []).map((booking) => {
    const review = byBooking.get(booking.id);
    const trip = returnedTrips.get(booking.id);
    return { ...booking, pickup_time: null, pickup_location: null, itinerary_notes: null, refund: refundsByBooking.get(booking.id), review,
      reviewable: !reviewError && !review && canReviewTrip(trip, booking.end_date, now),
      editable: !!review && !review.edited_at && Date.parse(review.created_at) >= now - 7 * 86_400_000 };
  }) as unknown as CustomerBooking[];
  const record = view === "record";
  const reviewView = view === "reviews";
  const historical = ["returned", "completed", "cancelled", "rejected", "expired"];
  const visibleBookings = record ? bookings.filter(booking => historical.includes(booking.status))
    : reviewView ? bookings.filter(booking => booking.review || booking.reviewable)
    : bookings;
  const title = record ? "Booking record" : reviewView ? "My reviews" : "My bookings";
  const description = record ? "Find completed rentals and closed bookings."
    : reviewView ? "Read your reviews and leave feedback for eligible trips."
    : "View your rental details and keep track of each booking.";

  return <div>
    <div className="mb-5">
      {(record || reviewView) && <Link href="/account/profile" className="mb-2 inline-flex min-h-11 items-center text-sm font-semibold text-[#0A3D91] hover:underline">← Back to profile</Link>}
      <h2 className="text-base font-semibold text-[#26364e]">{title}</h2>
      <p className="mt-1 text-xs leading-5 text-[#7b8797]">{description}</p>
    </div>
    {reviewView && (reviewError || datesError) ? <p role="alert" className="rounded-2xl border bg-white p-5 text-sm">Reviews are temporarily unavailable. Try again in a moment.</p>
      : (record || reviewView) && visibleBookings.length === 0 ? <p className="rounded-2xl border bg-white p-5 text-sm text-[#52647a]">
        {record ? "Your completed and closed bookings will appear here." : "Your reviews and trips eligible for feedback will appear here."}
      </p>
      : <BookingList key={`${title}:${typeof reviewTarget === "string" ? reviewTarget : ""}`} bookings={visibleBookings} now={now} supportDays={supportDays} reviewTarget={typeof reviewTarget === "string" ? reviewTarget : undefined} />}
  </div>;
}
