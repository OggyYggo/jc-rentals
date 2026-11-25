import { AdminHeading } from "@/components/admin/ui";
import { CarManager, type AdminCarRow } from "@/components/admin/car-manager";
import { getAdminContext } from "@/lib/admin-context";

export const instant = false;

export default async function AdminCarsPage() {
  const { supabase } = await getAdminContext();
  const { data, error } = await supabase.from("cars").select("id, brand, model, year, plate_number, car_type, vehicle_type, engine_cc, helmets_included, transmission, is_active, allows_self_drive, allows_with_driver, owner:owners(id,business_name), car_rates(mode, daily_rate), car_photos(path,thumb_path,sort_order)").order("created_at", { ascending: false });
  if (error) throw new Error("Could not load platform vehicles.");
  return <><AdminHeading eyebrow="Marketplace" title="Vehicles" description="All owners. Control what customers can see."/><CarManager cars={(data ?? []) as unknown as AdminCarRow[]}/></>;
}
