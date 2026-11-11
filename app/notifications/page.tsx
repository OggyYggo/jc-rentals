import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NotificationList } from "@/components/notifications/list";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ unread?: string }> }) {
  const { unread } = await searchParams;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  let query = db.from("notifications").select("id,title,body,url,read_at,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
  if (unread === "1") query = query.is("read_at", null);
  const { data } = await query;
  return <main className="mx-auto max-w-3xl px-5 py-10"><div className="flex items-end justify-between"><div><p className="text-xs font-medium text-blue-700">Your account</p><h1 className="mt-1 text-2xl font-semibold text-slate-900">Notifications</h1></div><div className="flex gap-3 text-sm"><Link className="text-blue-700" href="/notifications">All</Link><Link className="text-blue-700" href="/notifications?unread=1">Unread</Link><Link className="text-blue-700" href="/notifications/settings">Settings</Link></div></div><NotificationList items={data ?? []}/></main>;
}
