import { AdminHeading } from "@/components/admin/ui";
import { OwnerApplications, type OwnerApplication } from "@/components/admin/owner-applications";
import { getAdminContext } from "@/lib/admin-context";

export const instant = false;

export default async function AdminOwnerApplicationsPage() {
  const { supabase } = await getAdminContext();
  const { data, error } = await supabase.from("owner_applications").select("id,full_name,business_name,email,phone,car_make,car_model,car_year,message,status,created_at,plate_number,seats,transmission,offers_self_drive,offers_with_driver,daily_rate_self_drive,daily_rate_with_driver,admin_note,preferred_plan,vehicle_type,car_type,engine_cc,helmets_included").order("created_at", { ascending: false });
  if (error) throw new Error("Could not load vehicle listing applications.");

  return <>
    <AdminHeading eyebrow="Marketplace" title="Vehicle listing applications" description="Review applications, request corrections, or approve an owner and create a hidden draft vehicle." />
    <OwnerApplications rows={(data ?? []) as OwnerApplication[]} />
  </>;
}
