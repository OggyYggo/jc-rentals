import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AdminHeading, mobileAction } from "@/components/admin/ui";
import { SettingsForms } from "@/components/admin/settings-forms";
import { getAdminContext } from "@/lib/admin-context";
import { alertSettings } from "@/lib/admin-alerts/settings";
import { loadPlatformSettings, sections, type SettingsSection } from "@/lib/admin-settings";

export const instant = false;

export default async function SettingsSectionPage({ params }: PageProps<"/admin/settings/[section]">) {
  const { section: requested } = await params;
  if (!Object.hasOwn(sections, requested)) notFound();
  const section = requested as SettingsSection;
  const { supabase, user } = await getAdminContext();
  if (section === "phone-alerts") redirect("/notifications/settings");
  const [settings, alerts] = await Promise.all([
    section === "email-alerts" ? null : loadPlatformSettings(supabase),
    section === "email-alerts" ? alertSettings(supabase) : null,
  ]);
  const { label, description } = sections[section];
  return <>
    <div className="max-w-3xl font-body text-[#0F2342] lg:hidden">
      <Link href="/admin/settings" className={`${mobileAction} mb-3 gap-1 bg-white`}><ChevronLeft size={16} aria-hidden />Settings</Link>
      <header className="mb-4"><h1 className="font-heading text-2xl font-bold">{label}</h1><p className="mt-1 text-sm text-[#5B6F89]">{description}</p></header>
      <SettingsForms settings={settings} userId={user.id} alerts={alerts} section={section} mobile />
      {section === "credits" && <Link href="/admin/settings/payment-timing" className={`${mobileAction} mt-4 bg-white`}>Edit the low-credit reminder in Payment timing</Link>}
    </div>
    <div className="hidden lg:contents">
      <AdminHeading eyebrow="Platform" title={label} description={description} />
      <SettingsForms settings={settings} userId={user.id} alerts={alerts} section={section} />
    </div>
  </>;
}
