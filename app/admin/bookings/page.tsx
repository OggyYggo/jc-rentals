import { AdminHeading } from "@/components/admin/ui";
import { BookingManager, type AdminBooking } from "@/components/admin/booking-manager";
import { getAdminContext } from "@/lib/admin-context";

export const instant = false;

export default async function AdminBookingsPage() {
  const { supabase } = await getAdminContext();
  const { data, error } = await supabase.from("bookings").select("id, reference, status, payment, start_date, end_date, total_price, cancel_free_until, cancel_fee_percent, cancelled_at, canceller:profiles!bookings_cancelled_by_fkey(full_name), cancelled_by_role, cancel_kind, cancel_fee_amount, refund_amount, deposit_refund_status, commission_amount, created_at, customer:profiles!bookings_customer_id_fkey(full_name, phone), owner:owners!bookings_owner_id_fkey(business_name), car:cars!bookings_car_id_fkey(brand, model, plate_number)").order("created_at", { ascending: false });
  if (error) throw new Error("Could not load platform bookings.");
  return <><AdminHeading eyebrow="Operations" title="Bookings" description="Search and filter every booking across customers, owners, vehicles, and statuses."/><BookingManager now={new Date().getTime()} bookings={(data ?? []) as unknown as AdminBooking[]}/></>;
}
