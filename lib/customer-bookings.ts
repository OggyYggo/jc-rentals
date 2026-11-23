import type { createClient } from "@/lib/supabase/server";

type BookingPayment = { status: string; method: string };

export function customerBookings(db: Awaited<ReturnType<typeof createClient>>, userId: string) {
  return db.from("bookings").select("id,status,end_date,returned_at,completed_at,owner_id,payments(status,method)").eq("customer_id", userId);
}

export function customerBookingStatus(status: string, payments: BookingPayment[] | null) {
  if (status !== "awaiting_payment" && status !== "payment_review") return status;
  if (payments?.some(payment => payment.method === "owner_qr" && payment.status === "verified")) return "confirmed";
  if (payments?.some(payment => payment.method === "owner_qr" && payment.status === "pending")) return "payment_review";
  return status;
}
