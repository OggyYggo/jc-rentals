import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ProfileHub } from "@/components/customer/profile-hub";
import { ProfileEditor } from "@/components/customer/profile-editor";
import { SupabaseSetupNotice } from "@/components/customer/setup-notice";
import { getCustomerProfile } from "@/lib/customer-profile";
import { isSupabaseConfigured } from "@/lib/supabase/shared";

export const instant = false;

export default async function CustomerProfilePage({ searchParams }: { searchParams: Promise<{ section?: string | string[] }> }) {
  if (!isSupabaseConfigured()) return <SupabaseSetupNotice />;
  const [{ db, user, ...profile }, { section }] = await Promise.all([getCustomerProfile(), searchParams]);
  const [selfie, license] = section === "documents" ? await Promise.all([
    db.from("customer_selfies").select("status").eq("customer_id", user.id).maybeSingle(),
    profile.hasLicense ? db.from("profiles").select("license_path").eq("id", user.id).maybeSingle() : null,
  ]) : [null, null];
  const path = license?.data?.license_path;
  const preview = path?.startsWith(`${user.id}/`) && /\.(jpg|jpeg|png|webp)$/i.test(path)
    ? await db.storage.from("customer-docs").createSignedUrl(path, 120) : null;
  const editor = { userId: user.id, ...profile };

  return <>
    <div className="hidden md:block"><ProfileEditor {...editor} /></div>
    <div className="md:hidden">
      {section === "details" || section === "documents" ? <>
        <Link href="/account" className="mb-2 inline-flex min-h-11 items-center gap-1 rounded-md text-sm font-semibold text-[#0A3D91] hover:underline focus-visible:outline-2 focus-visible:outline-[#0A47B1]">
          <ChevronLeft size={17} aria-hidden="true" /> Back to profile
        </Link>
        <ProfileEditor key={section} section={section} selfieStatus={selfie?.data?.status} selfieUnavailable={Boolean(selfie?.error)}
          licensePreview={preview?.data?.signedUrl} {...editor} />
      </> : <ProfileHub db={db} userId={user.id} name={profile.fullName} email={user.email} joinedAt={user.created_at}
        hasLicense={profile.hasLicense} hasId={profile.hasId} verification={profile.verification} />}
    </div>
  </>;
}
