import { Suspense } from "react";
import { DesktopAccountRedirect } from "@/components/customer/desktop-account-redirect";
import { ProfileHub } from "@/components/customer/profile-hub";
import { SupabaseSetupNotice } from "@/components/customer/setup-notice";
import { getCustomerProfile } from "@/lib/customer-profile";
import { isSupabaseConfigured } from "@/lib/supabase/shared";

export const instant = false;

async function AccountProfile() {
  const { db, user, fullName, hasLicense, hasId, verification } = await getCustomerProfile();
  return <ProfileHub db={db} userId={user.id} name={fullName} email={user.email} joinedAt={user.created_at}
    hasLicense={hasLicense} hasId={hasId} verification={verification} />;
}

export default function AccountPage() {
  if (!isSupabaseConfigured()) return <SupabaseSetupNotice />;
  return <>
    <DesktopAccountRedirect />
    <div className="md:hidden"><Suspense fallback={<p role="status" className="rounded-2xl border bg-white p-4 text-sm">Loading your profile…</p>}>
      <AccountProfile />
    </Suspense></div>
  </>;
}
