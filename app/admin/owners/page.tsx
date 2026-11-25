import { AdminHeading } from "@/components/admin/ui";
import { OwnerManager, type CustomerOption, type OwnerRow } from "@/components/admin/owner-manager";
import { getAdminContext } from "@/lib/admin-context";

export const instant = false;

export default async function AdminOwnersPage() {
  const { supabase } = await getAdminContext();
  const [{ data: owners, error: ownersError }, { data: customers, error: customersError }, { data: setting }, { data: canArchive, error: accessError }, { data: balances }, { data: threshold }] = await Promise.all([
    supabase.from("owners").select("id, profile_id, business_name, contact_phone, commission_rate, is_active, archived_at, active_before_archive, fee_mode, cars(count), payment_options:owner_payment_options(is_active,verified), profile:profiles(full_name, phone)").order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name, phone").eq("role", "customer").order("created_at", { ascending: false }),
    supabase.from("settings").select("value").eq("key", "default_commission_rate").maybeSingle(),
    supabase.rpc("is_super_admin"),
    supabase.from("owner_credit_balances").select("owner_id,balance"),
    supabase.from("settings").select("value").eq("key", "credit_low_threshold").maybeSingle(),
  ]);
  if (ownersError || customersError || accessError) throw new Error("Could not load owner records.");
  const defaultCommission = Number(setting?.value ?? 0.05);
  const balanceByOwner = new Map((balances ?? []).map(row => [row.owner_id, Number(row.balance)]));
  const rows = ((owners ?? []) as unknown as OwnerRow[]).map(row => ({
    ...row, lowCredits: row.fee_mode === "credits" && (balanceByOwner.get(row.id) ?? 0) < Number(threshold?.value ?? 200),
  }));
  return <><AdminHeading eyebrow="Marketplace" title="Owners" description="Manage rental businesses, access, contact details, and commission rates."/><OwnerManager owners={rows} customers={(customers ?? []) as unknown as CustomerOption[]} defaultCommission={defaultCommission} canArchive={canArchive === true}/></>;
}
