import { ProfileHome } from "@/components/customer/profile-home";
import { customerBookings, customerBookingStatus } from "@/lib/customer-bookings";
import { canReviewTrip } from "@/lib/reviews/eligibility";
import type { createClient } from "@/lib/supabase/server";

export async function ProfileHub({ db, userId, name, email, joinedAt, hasLicense, hasId, verification }: {
  db: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  name: string;
  email?: string;
  joinedAt?: string;
  hasLicense: boolean;
  hasId: boolean;
  verification: string;
}) {
  const [selfie, bookings, reviews] = await Promise.all([
    db.from("customer_selfies").select("status").eq("customer_id", userId).maybeSingle(),
    customerBookings(db, userId),
    db.from("reviews").select("booking_id").eq("customer_id", userId),
  ]);
  const rows = bookings.data ?? [];
  const statuses = rows.map(row => customerBookingStatus(row.status, row.payments));
  const reviewed = new Set(reviews.data?.map(row => row.booking_id));
  const now = new Date().getTime();
  return <ProfileHome name={name} email={email} joinedAt={joinedAt} hasLicense={hasLicense} hasId={hasId}
    verification={verification} selfieStatus={selfie.data?.status} selfieUnavailable={Boolean(selfie.error)}
    bookingCounts={bookings.error ? null : {
      toPay: statuses.filter(status => status === "awaiting_payment").length,
      upcoming: statuses.filter(status => status === "confirmed").length,
    }}
    tripsToRate={bookings.error || reviews.error ? null : rows.filter(row => !reviewed.has(row.id) && canReviewTrip(row, row.end_date, now)).length}
  />;
}
