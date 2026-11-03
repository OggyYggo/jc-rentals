import { PageHeading } from "@/components/owner/ui";
import { CarManager, type OwnerCar } from "@/components/owner/car-manager";
import { getOwnerContext } from "@/lib/owner-context";

export const instant = false;

export default async function OwnerCarsPage({ searchParams }: PageProps<"/owner/cars">) {
  const [{ supabase, owner }, params] = await Promise.all([getOwnerContext(), searchParams]);
  const { data, error } = await supabase.from("cars").select("id, brand, model, year, plate_number, car_type, transmission, fuel_type, seats, description, is_active, allows_self_drive, allows_with_driver, car_rates(id, mode, daily_rate, deposit_amount, included_hours, overtime_per_hour, notes), car_photos(id, path, sort_order)").eq("owner_id", owner.id).order("created_at", { ascending: false });
  if (error) throw new Error("Could not load your vehicle list.");
  const cars = (data ?? []).map((car) => ({
    ...car,
    car_photos: (car.car_photos ?? []).map((photo) => ({
      ...photo,
      publicUrl: supabase.storage.from("car-photos").getPublicUrl(photo.path).data.publicUrl,
    })),
  }));

  return <><PageHeading eyebrow="Fleet management" title="My cars" description="Add vehicles, configure rental modes, update rates, and manage the photos customers see."/><CarManager cars={cars as unknown as OwnerCar[]} ownerId={owner.id} initialOpen={params.new === "1"}/></>;
}
