import { AdminHeading } from "@/components/admin/ui";
import { OwnerManager, type CustomerOption, type OwnerRow } from "@/components/admin/owner-manager";
import { getAdminContext } from "@/lib/admin-context";

export const instant = false;

export default async function AdminOwnersPage() {
  const { supabase } = await getAdminContext();
  const [{ data: owners, error: ownersError }, { data: customers, error: customersError }, { data: setting }] = await Promise.all([
    supabase.from("owners").select("id, profile_id, business_name, contact_phone, commission_rate, is_active, payment_qr_path, payment_qr_verified, profile:profiles(full_name, phone)").order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name, phone").eq("role", "customer").order("created_at", { ascending: false }),
    supabase.from("settings").select("value").eq("key", "default_commission_rate").maybeSingle(),
  ]);
  if (ownersError || customersError) throw new Error("Could not load owner records.");
  const defaultCommission = Number(setting?.value ?? 0.05);
  return <><AdminHeading eyebrow="Marketplace" title="Owners" description="Manage rental businesses, access, contact details, and commission rates."/><OwnerManager owners={(owners ?? []) as unknown as OwnerRow[]} customers={(customers ?? []) as unknown as CustomerOption[]} defaultCommission={defaultCommission}/></>;
}
