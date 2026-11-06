import { AdminHeading } from "@/components/admin/ui";
import { PlatformSettingsForm } from "@/components/admin/platform-settings-form";
import { getAdminContext } from "@/lib/admin-context";
import { AdminPaymentSettings } from "@/components/admin/admin-payment-settings";

export const instant = false;

export default async function AdminSettingsPage() {
  const { supabase, user } = await getAdminContext();
  const { data, error } = await supabase.from("settings").select("key, value").in("key", ["default_commission_rate", "rental_policies", "deposit_percent", "payment_window_hours", "min_credit_to_list", "invoice_grace_days", "platform_account_name", "platform_qr_path", "payment_instructions"]);
  if (error) throw new Error("Could not load platform settings.");
  const values = new Map((data ?? []).map(row => [row.key, row.value]));
  return <><AdminHeading eyebrow="Platform" title="Settings" description="Set defaults for new owners and manage the rental policies shown across the platform."/><PlatformSettingsForm commissionRate={Number(values.get("default_commission_rate") ?? 0.05)} policies={String(values.get("rental_policies") ?? "")} updatedBy={user.id}/><AdminPaymentSettings updatedBy={user.id} settings={{deposit_percent:Number(values.get("deposit_percent")??0.3),payment_window_hours:Number(values.get("payment_window_hours")??24),min_credit_to_list:Number(values.get("min_credit_to_list")??500),invoice_grace_days:Number(values.get("invoice_grace_days")??7),platform_account_name:String(values.get("platform_account_name")??""),platform_qr_path:String(values.get("platform_qr_path")??""),payment_instructions:String(values.get("payment_instructions")??"")}}/></>;
}
