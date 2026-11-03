import { AdminHeading } from "@/components/admin/ui";
import { CustomerManager, type AdminCustomer } from "@/components/admin/customer-manager";
import { getAdminContext } from "@/lib/admin-context";

export const instant = false;

export default async function AdminCustomersPage() {
  const { supabase } = await getAdminContext();
  const { data, error } = await supabase.from("profiles").select("id, full_name, phone, verification, created_at, license_path, id_path").eq("role", "customer").order("created_at", { ascending: false });
  if (error) throw new Error("Could not load customer records.");
  return <><AdminHeading eyebrow="People" title="Customers" description="Review customer records and privately inspect submitted verification documents."/><CustomerManager customers={(data ?? []) as AdminCustomer[]}/></>;
}
