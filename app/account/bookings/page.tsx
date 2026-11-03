import { redirect } from "next/navigation";
import { connection } from "next/server";
import { BookingList, type CustomerBooking } from "@/components/customer/booking-list";
import { SupabaseSetupNotice } from "@/components/customer/setup-notice";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/shared";

export default async function CustomerBookingsPage() {
  if (!isSupabaseConfigured()) return <SupabaseSetupNotice />;
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase.from("bookings").select("id, reference, mode, start_date, end_date, daily_rate, total_price, deposit_amount, status, payment, created_at, car:cars(brand, model, year, car_type)").eq("customer_id", user.id).order("created_at", { ascending: false });
  if (error) throw new Error("We could not load your bookings. Please try again later.");

  const todayManila = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return <div><div className="mb-5"><h2 className="text-base font-semibold text-[#26364e]">My bookings</h2><p className="mt-1 text-xs leading-5 text-[#7b8797]">View your rental details and keep track of each booking.</p></div><BookingList bookings={(data ?? []) as unknown as CustomerBooking[]} todayManila={todayManila}/></div>;
}
