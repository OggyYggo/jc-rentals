import { redirect } from "next/navigation";
import { connection } from "next/server";
import { BookingList, type CustomerBooking } from "@/components/customer/booking-list";
import { SupabaseSetupNotice } from "@/components/customer/setup-notice";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/shared";

export const instant = false;

export default async function CustomerBookingsPage() {
  if (!isSupabaseConfigured()) return <SupabaseSetupNotice />;
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase.from("bookings").select("id, reference, mode, start_date, end_date, daily_rate, total_price, deposit_amount, status, payment, created_at").eq("customer_id", user.id).order("created_at", { ascending: false });
  if (error) {
    console.error("Customer bookings query failed:", String(error), { message: error.message, code: error.code, details: error.details, hint: error.hint });
    return <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950"><h2 className="font-semibold">Bookings are temporarily unavailable</h2><p className="mt-2 leading-6">The payment database may not be set up yet. An administrator should apply the payment status migration and then rerun the payment QR module migration in Supabase.</p><p className="mt-2 text-xs text-amber-800">If both migrations have already completed, check the Vercel function logs for the bookings query error.</p></div>;
  }

  const todayManila = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const bookings = (data ?? []).map((booking) => ({ ...booking, pickup_time: null, pickup_location: null, itinerary_notes: null, car: null })) as unknown as CustomerBooking[];
  return <div><div className="mb-5"><h2 className="text-base font-semibold text-[#26364e]">My bookings</h2><p className="mt-1 text-xs leading-5 text-[#7b8797]">View your rental details and keep track of each booking.</p></div><BookingList bookings={bookings} todayManila={todayManila}/></div>;
}
