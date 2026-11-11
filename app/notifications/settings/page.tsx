import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NotificationSettings } from "@/components/notifications/settings";

export const instant = false;

export default async function NotificationSettingsPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await db.from("notification_preferences").select("email_enabled,push_enabled,muted_types").eq("user_id", user.id).maybeSingle();
  return <main className="mx-auto max-w-2xl px-5 py-10"><p className="text-xs font-medium text-blue-700">Your account</p><h1 className="mt-1 text-2xl font-semibold text-slate-900">Notification settings</h1><p className="mt-2 text-sm text-slate-600">Choose which optional delivery methods and updates you receive.</p><NotificationSettings userId={user.id} initial={data}/></main>;
}
