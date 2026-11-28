import { AdminHeading } from "@/components/admin/ui";
import { SettingsForms } from "@/components/admin/settings-forms";
import { MobileSettingsHome } from "@/components/admin/mobile-settings-home";
import { getAdminContext } from "@/lib/admin-context";
import { alertSettings } from "@/lib/admin-alerts/settings";
import { loadPlatformSettings, sections, settingsGroups, settingsSummaries, type SettingsSection } from "@/lib/admin-settings";

export const instant = false;

export default async function AdminSettingsPage() {
  const { supabase, user } = await getAdminContext();
  const [settings, emailAlerts, devices] = await Promise.all([
    loadPlatformSettings(supabase),
    alertSettings(supabase),
    supabase.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);
  const summary: Partial<Record<SettingsSection, string>> = {
    ...settingsSummaries(settings),
    "email-alerts": emailAlerts ? emailAlerts.senderReady ? "Email delivery configured" : "Email delivery incomplete" : "Could not load",
    "phone-alerts": devices.error || devices.count === null ? "Could not load" : `${devices.count} ${devices.count === 1 ? "device" : "devices"}`,
  };
  return <>
    <div className="hidden lg:contents">
      <AdminHeading eyebrow="Platform" title="Settings" description="Set defaults for new owners and manage the rental policies shown across the platform." />
      <SettingsForms settings={settings} userId={user.id} alerts={emailAlerts} />
    </div>
    <MobileSettingsHome paused={settings?.values.bookings_paused ?? null} userId={user.id} groups={settingsGroups.map(group => ({
      label: group.label, rows: group.sections.map(section => ({
        href: section === "phone-alerts" ? "/notifications/settings" : `/admin/settings/${section}`,
        label: sections[section].label, value: summary[section] ?? "Could not load",
      })),
    }))} />
  </>;
}
