import { redirect } from "next/navigation";
import { ProfileEditor } from "@/components/customer/profile-editor";
import { SupabaseSetupNotice } from "@/components/customer/setup-notice";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/shared";

export const instant = false;

export default async function CustomerProfilePage() {
  if (!isSupabaseConfigured()) return <SupabaseSetupNotice />;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile, error }, { data: documents, error: documentError }] = await Promise.all([
    supabase.from("profiles").select("full_name, phone, verification").eq("id", user.id).maybeSingle(),
    supabase.from("my_customer_document_presence").select("has_license, has_id").eq("id", user.id).maybeSingle(),
  ]);
  if (error || documentError) throw new Error("We could not load your profile. Please try again later.");

  return <ProfileEditor userId={user.id} fullName={profile?.full_name ?? user.user_metadata?.full_name ?? ""} phone={profile?.phone ?? ""} hasLicense={Boolean(documents?.has_license)} hasId={Boolean(documents?.has_id)} verification={profile?.verification ?? "none"} />;
}
