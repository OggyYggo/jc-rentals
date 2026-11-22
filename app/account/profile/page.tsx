import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ProfileHome } from "@/components/customer/profile-home";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ProfileEditor } from "@/components/customer/profile-editor";
import { SupabaseSetupNotice } from "@/components/customer/setup-notice";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/shared";

export const instant = false;

export default async function CustomerProfilePage({ searchParams }: { searchParams: Promise<{ section?: string | string[] }> }) {
  if (!isSupabaseConfigured()) return <SupabaseSetupNotice />;
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile, error }, { data: documents, error: documentError }] = await Promise.all([
    supabase.from("profiles").select("full_name, phone, verification, verification_rejection_reason, license_declared_classes").eq("id", user.id).maybeSingle(),
    supabase.from("my_customer_document_presence").select("has_license, has_id").eq("id", user.id).maybeSingle(),
  ]);
  if (error || documentError) throw new Error("We could not load your profile. Please try again later.");

  const fullName = (profile?.full_name?.trim() || (typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : ""));
  const hasLicense = Boolean(documents?.has_license);
  const hasId = Boolean(documents?.has_id);
  const verification = profile?.verification ?? "none";
  const { section } = await searchParams;

  const selfie = section === "documents"
    ? await supabase.from("customer_selfies").select("status").eq("customer_id", user.id).maybeSingle()
    : null;
  const editor = {
    userId: user.id, fullName, phone: profile?.phone ?? "", hasLicense, hasId, verification,
    verificationNote: profile?.verification_rejection_reason, declaredClasses: profile?.license_declared_classes ?? [],
  };

  return <>
    <div className="hidden md:block"><ProfileEditor {...editor} /></div>
    <div className="md:hidden">
      {section === "details" || section === "documents" ? <>
        <Link href="/account/profile" className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[#0A3D91] hover:underline">
          <ChevronLeft size={17} aria-hidden="true" /> Back to profile
        </Link>
        <ProfileEditor key={section} section={section} selfieStatus={selfie?.data?.status} selfieUnavailable={Boolean(selfie?.error)} {...editor} />
      </> : <ProfileHome name={fullName} email={user.email} hasLicense={hasLicense} hasId={hasId} verification={verification} />}
    </div>
  </>;
}
