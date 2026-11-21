import { PaymentHardeningSettings } from "@/components/admin/payment-hardening-settings";
import { CancellationSettings } from "@/components/admin/cancellation-settings";
import { AdminHeading } from "@/components/admin/ui";
import { PlatformSettingsForm } from "@/components/admin/platform-settings-form";
import { getAdminContext } from "@/lib/admin-context";
import { AdminPaymentSettings } from "@/components/admin/admin-payment-settings";

import { AlertSettings } from "@/components/admin/alert-settings";
import { alertSettings } from "@/lib/admin-alerts/settings";

export const instant = false;

export default async function AdminSettingsPage() {
  const { supabase, user } = await getAdminContext();
  const { data, error } = await supabase.from("settings").select("key, value").in("key", ["default_commission_rate", "rental_policies", "deposit_percent", "payment_window_hours", "payment_review_hours", "payment_resubmit_grace_hours", "refund_due_days", "credit_low_threshold", "min_credit_to_list", "invoice_grace_days", "platform_account_name", "platform_qr_path", "payment_instructions", "cancellation_free_hours", "cancellation_fee_percent", "pickup_reference_hour"]);
  if (error) throw new Error("Could not load platform settings.");
  const emailAlerts = await alertSettings(supabase);
  const values = new Map((data ?? []).map(row => [row.key, row.value]));
  return <><AdminHeading eyebrow="Platform" title="Settings" description="Set defaults for new owners and manage the rental policies shown across the platform."/><PlatformSettingsForm commissionRate={Number(values.get("default_commission_rate") ?? 0.05)} policies={String(values.get("rental_policies") ?? "")} updatedBy={user.id}/><AdminPaymentSettings updatedBy={user.id} settings={{deposit_percent:Number(values.get("deposit_percent")??0.3),min_credit_to_list:Number(values.get("min_credit_to_list")??500),invoice_grace_days:Number(values.get("invoice_grace_days")??7),platform_account_name:String(values.get("platform_account_name")??""),platform_qr_path:String(values.get("platform_qr_path")??""),payment_instructions:String(values.get("payment_instructions")??"")}}/><PaymentHardeningSettings values={{ p_window: Number(values.get("payment_window_hours") ?? 24), p_review: Number(values.get("payment_review_hours") ?? 12), p_resubmit: Number(values.get("payment_resubmit_grace_hours") ?? 2), p_refund: Number(values.get("refund_due_days") ?? 3), p_threshold: Number(values.get("credit_low_threshold") ?? 200) }}/><CancellationSettings hours={Number(values.get("cancellation_free_hours") ?? 24)} percent={Number(values.get("cancellation_fee_percent") ?? 50)} pickupHour={Number(values.get("pickup_reference_hour") ?? 8)} userId={user.id}/><AlertSettings settings={emailAlerts}/></>;
}
