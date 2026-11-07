import { CalendarDays } from "lucide-react";
import { BookingWorkflow, type OwnerBooking } from "@/components/owner/booking-workflow";
import { PageHeading } from "@/components/owner/ui";
import { getOwnerContext } from "@/lib/owner-context";

export const instant = false;

export default async function OwnerBookingsPage() {
  const { supabase, owner } = await getOwnerContext();
  const [{ data, error }, { data: contacts, error: contactsError }] = await Promise.all([
    supabase.from("bookings").select("id, reference, start_date, end_date, pickup_time, pickup_location, itinerary_notes, total_price, commission_amount, owner_earnings, status, payment, mode, created_at, car:cars!bookings_car_id_fkey(id, brand, model, plate_number)").eq("owner_id", owner.id).order("created_at", { ascending: false }),
    supabase.from("owner_booking_contacts").select("booking_id, full_name, phone"),
  ]);
  if (error || contactsError) {
    const describe = (failure: typeof error) => failure
      ? [failure.code, failure.message, failure.details, failure.hint].filter(Boolean).join(" | ")
      : "ok";
    console.error(`Could not load owner bookings: bookings [${describe(error)}]; contacts [${describe(contactsError)}]`);
    throw new Error("Could not load bookings for this rental business.");
  }
  const contactByBooking = new Map((contacts ?? []).map((contact) => [contact.booking_id, contact]));
  const bookings = (data ?? []).map((booking) => ({ ...booking, customer: contactByBooking.get(booking.id) ?? null })) as unknown as OwnerBooking[];
  const requests = bookings.filter((booking) => booking.status === "payment_review").length;

  return <><PageHeading eyebrow="Reservations" title="Bookings" description="Manage confirmed rentals and record the pickup balance when collected." action={<span className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#e1e7ef] bg-white px-3 text-[10px] font-medium text-[#6f7d91]"><CalendarDays size={13}/>{requests} deposits to review</span>}/><BookingWorkflow bookings={bookings.filter((booking) => booking.status !== "payment_review")}/></>;
}
