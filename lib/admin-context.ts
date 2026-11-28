import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/shared";
import { hasStaffMembership } from "@/lib/staff/context";

export async function getAdminContext() {
  if (!isSupabaseConfigured()) redirect("/admin-setup");
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") redirect(await hasStaffMembership(supabase,user.id) ? "/staff" : "/account/bookings");
  return { supabase, user, profile };
}
