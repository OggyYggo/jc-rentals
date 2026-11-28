import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { pickupTokenPattern } from "@/lib/pickup/model";
import { staffAbilities, staffError } from "@/lib/staff/content";
import { AuthForm } from "@/components/customer/auth-form";
import { StaffRules, staffAction, staffCard, staffPrimary } from "@/components/staff/shared";
import { AcceptStaffButton } from "@/components/staff/accept-button";
import { StaffLoadError } from "@/components/staff/load-error";
import { isSupabaseConfigured } from "@/lib/supabase/shared";

export const instant = false;
export const metadata = { title: "Handover staff invitation" };

type Preview = { display_name: string; email: string; business: string };

export default async function StaffAcceptPage({ searchParams }: PageProps<"/staff/accept">) {
  const { token, mode } = await searchParams;
  const valid = typeof token === "string" && pickupTokenPattern.test(token);
  let invite: Preview | null = null;
  let email: string | undefined;
  let failed = false;
  if (valid && isSupabaseConfigured()) {
    const db = await createClient();
    const [preview, current] = await Promise.all([db.rpc("staff_invite_preview",{ p_token:token }),db.auth.getUser()]);
    invite = preview.data as Preview | null;
    email = current.data.user?.email;
    failed = Boolean(preview.error);
  }
  if (failed) return <main className="mx-auto max-w-lg p-4"><StaffLoadError message="Could not check this invitation." /></main>;
  if (!invite || !valid) return <main className="mx-auto max-w-lg p-4">
    <section className={`${staffCard} space-y-3`}><h1 className="font-heading text-xl font-bold">Invitation unavailable</h1>
      <p>{staffError("STAFF_INVITE_INVALID")}</p><Link href="/contact" className={staffAction}>Contact support</Link>
    </section>
  </main>;
  const path = `/staff/accept?token=${token}`;
  const correct = email?.toLowerCase() === invite.email;
  const authMode = mode === "login" ? "login" : "signup";
  const showAccountChoices = Boolean(email && !correct && mode !== "login" && mode !== "signup");
  return <main className="mx-auto max-w-lg space-y-4 p-4 font-body text-[#0F2342]">
    <section className={`${staffCard} space-y-3`}>
      <h1 className="break-words font-heading text-2xl font-bold">{invite.business} invited you</h1>
      <p>You can scan pickup passes and hand over vehicles for them.</p>
      <StaffRules items={staffAbilities.slice(0,3)} />
      {correct && <AcceptStaffButton token={token} />}
      {showAccountChoices && <div className="space-y-2">
        <p>Use the invited email address. If this is your first time using Kuyog Bohol, create an account and choose your own password.</p>
        <div className="flex flex-wrap gap-2">
          <Link href={`${path}&mode=signup`} prefetch={false} className={staffPrimary}>Create an account</Link>
          <Link href={`${path}&mode=login`} prefetch={false} className={staffAction}>Sign in with the invited email</Link>
        </div>
      </div>}
    </section>
    {!correct && !showAccountChoices && <AuthForm key={authMode} mode={authMode} configured next={path}
      staffInvite={{ email:invite.email,name:invite.display_name }} />}
  </main>;
}
