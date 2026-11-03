import { AdminHeading } from "@/components/admin/ui";
import { CarManager, type AdminCarRow } from "@/components/admin/car-manager";
import { getAdminContext } from "@/lib/admin-context";

export const instant = false;

export default async function AdminCarsPage() {
  const { supabase } = await getAdminContext();
  const { data, error } = await supabase.from("cars").select("id, brand, model, year, plate_number, car_type, transmission, is_active, allows_self_drive, allows_with_driver, owner:owners(business_name), car_rates(mode, daily_rate), car_photos(id)").order("created_at", { ascending: false });
  if (error) throw new Error("Could not load platform vehicles.");
  return <><AdminHeading eyebrow="Marketplace" title="Cars" description="Review vehicles across all owners and control their public availability."/><CarManager cars={(data ?? []) as unknown as AdminCarRow[]}/></>;
}
