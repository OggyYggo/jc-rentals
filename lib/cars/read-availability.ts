import type { SupabaseClient } from "@supabase/supabase-js";
import type { AvailabilityPeriod } from "./availability";

type Period = { start_date: string; end_date: string };
type BookingPeriod = Period & { kind: "booked" | "held" };

export async function readAvailability(db: SupabaseClient, carId: string, start: string, end: string): Promise<AvailabilityPeriod[] | null> {
  try {
    const [blocks, bookings] = await Promise.all([
      db.from("public_car_blocked_dates").select("start_date,end_date").eq("car_id", carId)
        .lte("start_date", end).gte("end_date", start).overrideTypes<Period[], { merge: false }>(),
      db.from("public_car_booking_dates").select("start_date,end_date,kind").eq("car_id", carId)
        .lte("start_date", end).gte("end_date", start).overrideTypes<BookingPeriod[], { merge: false }>(),
    ]);
    if (blocks.error || bookings.error) {
      console.error("Could not load vehicle availability", { blocks: Boolean(blocks.error), bookings: Boolean(bookings.error) });
      return null;
    }
    return [
      ...blocks.data.map(period => ({ start: period.start_date, end: period.end_date, kind: "blocked" as const })),
      ...bookings.data.map(period => ({ start: period.start_date, end: period.end_date, kind: period.kind })),
    ];
  } catch {
    console.error("Vehicle availability query failed");
    return null;
  }
}
