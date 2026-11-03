import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/shared";

export async function getOwnerContext() {
  if (!isSupabaseConfigured()) redirect("/owner-setup");
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();
  if (profile?.role !== "owner") redirect("/account/bookings");

  const { data: owner } = await supabase.from("owners").select("id, business_name, commission_rate, is_active").eq("profile_id", user.id).maybeSingle();
  if (!owner || !owner.is_active) redirect("/owner-setup");

  return { supabase, user, profile, owner };
}
