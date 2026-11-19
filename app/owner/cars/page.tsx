import { PageHeading } from "@/components/owner/ui";
import { CarManager, type OwnerCar } from "@/components/owner/car-manager";
import { getOwnerContext } from "@/lib/owner-context";

export const instant = false;

export default async function OwnerCarsPage({ searchParams }: PageProps<"/owner/cars">) {
  const [{ supabase, owner }, params] = await Promise.all([getOwnerContext(), searchParams]);
  const [{ data, error }, { data: usage }, { count: hiddenCarsCount }] = await Promise.all([
    supabase.from("cars").select("id, brand, model, year, plate_number, car_type, vehicle_type, engine_cc, helmets_included, transmission, fuel_type, seats, description, is_active, plan_hidden, allows_self_drive, allows_with_driver, bookings(count), car_rates(id, mode, daily_rate, deposit_amount, included_hours, overtime_per_hour, notes, fuel_policy, mileage_limit, minimum_age, license_required, fuel_included, driver_meals_included, accommodation_included, coverage_area), car_photos(id, path, thumb_path, sort_order)").eq("owner_id", owner.id).order("created_at", { ascending: false }),
    supabase.rpc("owner_car_usage", { p_owner: owner.id }),
    supabase.from("cars").select("id", { count: "exact", head: true }).eq("owner_id", owner.id).eq("plan_hidden", true),
  ]);
  if (error) throw new Error("Could not load your vehicle list.");
  const cars = (data ?? []).map((car) => ({
    ...car,
    car_photos: (car.car_photos ?? []).map((photo) => ({
      ...photo,
      publicUrl: supabase.storage.from("car-photos").getPublicUrl(photo.thumb_path ?? photo.path).data.publicUrl,
    })),
  }));

  const currentUsage = Array.isArray(usage) ? usage[0] : null;
  return <><PageHeading eyebrow="Fleet management" title="My vehicles" description="Add vehicles, configure rental modes, update rates, and manage the photos customers see."/><CarManager cars={cars as unknown as OwnerCar[]} ownerId={owner.id} initialOpen={params.new === "1"} usage={currentUsage ? { used: Number(currentUsage.used), limit: Number(currentUsage.max_cars) } : null} hiddenByPlan={hiddenCarsCount ?? 0}/></>;
}
