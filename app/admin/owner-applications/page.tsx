import { AdminHeading } from "@/components/admin/ui";
import { OwnerApplications, type OwnerApplication } from "@/components/admin/owner-applications";
import { getAdminContext } from "@/lib/admin-context";

export const instant = false;

export default async function AdminOwnerApplicationsPage() {
  const { supabase } = await getAdminContext();
  const { data, error } = await supabase.from("owner_applications").select("id,full_name,business_name,email,phone,car_make,car_model,car_year,message,status,created_at").order("created_at", { ascending: false });
  if (error) throw new Error("Could not load car listing applications.");

  return <>
    <AdminHeading eyebrow="Marketplace" title="Car listing applications" description="Review owner applications and contact applicants. Approved applicants still need an owner account set up under Owners." />
    <OwnerApplications rows={(data ?? []) as OwnerApplication[]} />
  </>;
}
