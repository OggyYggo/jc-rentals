import { CalendarManager, type CalendarBlock, type CalendarBooking, type CalendarCar } from "@/components/owner/calendar-manager";
import { PageHeading } from "@/components/owner/ui";
import { getOwnerContext } from "@/lib/owner-context";

export const instant = false;

export default async function OwnerCalendarPage() {
  const { supabase, owner } = await getOwnerContext();
  const [{ data: cars, error: carsError }, { data: bookings, error: bookingsError }, { data: blocks, error: blocksError }, { data: contacts, error: contactsError }] = await Promise.all([
    supabase.from("cars").select("id, brand, model, plate_number").eq("owner_id", owner.id).order("brand"),
    supabase.from("bookings").select("id, reference, car_id, start_date, end_date, status, car:cars(brand, model)").eq("owner_id", owner.id).order("start_date"),
    supabase.from("car_blocked_dates").select("id, car_id, start_date, end_date, reason, car:cars(brand, model)").order("start_date"),
    supabase.from("owner_booking_contacts").select("booking_id, full_name"),
  ]);
  if (carsError || bookingsError || blocksError || contactsError) throw new Error("Could not load fleet availability.");
  const contactByBooking = new Map((contacts ?? []).map((contact) => [contact.booking_id, contact]));
  const bookingsWithCustomer = (bookings ?? []).map((booking) => ({ ...booking, customer: contactByBooking.get(booking.id) ?? null }));
  return <><PageHeading eyebrow="Fleet availability" title="Calendar" description="Review bookings across vehicles and block dates for maintenance or personal use."/><CalendarManager cars={(cars ?? []) as CalendarCar[]} bookings={bookingsWithCustomer as unknown as CalendarBooking[]} blocks={(blocks ?? []) as unknown as CalendarBlock[]}/></>;
}
