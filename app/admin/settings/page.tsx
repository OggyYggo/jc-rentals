import { AdminHeading } from "@/components/admin/ui";
import { PlatformSettingsForm } from "@/components/admin/platform-settings-form";
import { getAdminContext } from "@/lib/admin-context";

export const instant = false;

export default async function AdminSettingsPage() {
  const { supabase, user } = await getAdminContext();
  const { data, error } = await supabase.from("settings").select("key, value").in("key", ["default_commission_rate", "rental_policies"]);
  if (error) throw new Error("Could not load platform settings.");
  const values = new Map((data ?? []).map(row => [row.key, row.value]));
  return <><AdminHeading eyebrow="Platform" title="Settings" description="Set defaults for new owners and manage the rental policies shown across the platform."/><PlatformSettingsForm commissionRate={Number(values.get("default_commission_rate") ?? 0.05)} policies={String(values.get("rental_policies") ?? "")} updatedBy={user.id}/></>;
}
