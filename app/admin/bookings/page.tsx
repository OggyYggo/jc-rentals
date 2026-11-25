import { AdminHeading } from "@/components/admin/ui";
import { BookingManager, type AdminBooking } from "@/components/admin/booking-manager";
import { getAdminContext } from "@/lib/admin-context";

export const instant = false;

export default async function AdminBookingsPage({ searchParams }: { searchParams: Promise<{ reference?: string; customer?: string }> }) {
  const { reference, customer } = await searchParams;
  const initialReference = typeof reference === "string" ? reference : "";
  const { supabase } = await getAdminContext();
  let request = supabase.from("bookings").select("id, reference, cancellation_policy_version, cancellation_policy_accepted_at, status, payment, start_date, end_date, total_price, cancel_free_until, cancel_fee_percent, cancelled_at, canceller:profiles!bookings_cancelled_by_fkey(full_name), cancelled_by_role, cancel_kind, cancel_fee_amount, refund_amount, deposit_refund_status, commission_amount, created_at, customer:profiles!bookings_customer_id_fkey(full_name, phone), owner:owners!bookings_owner_id_fkey(business_name), car:cars!bookings_car_id_fkey(brand, model, plate_number)").order("created_at", { ascending: false });
  if (typeof customer === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(customer)) request = request.eq("customer_id", customer);
  const { data, error } = await request;
  if (error) throw new Error("Could not load platform bookings.");
  return <><AdminHeading eyebrow="Operations" title="Bookings" description="Search and filter every booking across customers, owners, vehicles, and statuses."/><BookingManager key={initialReference} initialReference={initialReference} bookings={(data ?? []) as unknown as AdminBooking[]}/></>;
}
