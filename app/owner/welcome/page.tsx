import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { PasswordUpdateForm } from "@/components/auth/password-update-form";
import { getOwnerContext } from "@/lib/owner-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { peso } from "@/lib/plans/breakEven";

export default async function OwnerWelcomePage() {
  const { owner, user } = await getOwnerContext();
  const admin = createAdminClient();
  const { data: application } = admin ? await admin.from("owner_applications").select("preferred_plan").eq("user_id", user.id).eq("status", "approved").order("reviewed_at", { ascending: false }).limit(1).maybeSingle() : { data: null };
  const preferredCode = application?.preferred_plan;
  const [{ data: preferredPlan }, { data: assignment }] = admin && preferredCode && preferredCode !== "starter" ? await Promise.all([
    admin.from("plans").select("id,code,name,price_php,max_active_vehicles,commission_rate,is_public,is_active").eq("code", preferredCode).maybeSingle(),
    admin.from("owner_plans").select("plan_id").eq("owner_id", owner.id).maybeSingle(),
  ]) : [{ data: null }, { data: null }];
  const { data: activePlan } = admin && assignment?.plan_id ? await admin.from("plans").select("code").eq("id", assignment.plan_id).maybeSingle() : { data: null };
  const showActivation = preferredPlan?.is_public && preferredPlan.is_active && activePlan?.code !== preferredPlan.code;
  return <main className="min-h-screen bg-[#f5f8fc] px-5 py-12 text-[#26364e] sm:px-8"><div className="mx-auto max-w-xl">
    <p className="text-xs font-semibold uppercase tracking-wide text-[#2457d6]">Application approved</p>
    <h1 className="mt-2 text-3xl font-semibold">Welcome, {owner.business_name}</h1>
    <p className="mt-3 text-sm leading-6 text-[#68778c]">Set a password to finish setting up your owner account.</p>
    <div className="my-6 space-y-3 rounded-xl border border-[#e1e7ef] bg-white p-5 text-sm">
      <p className="flex items-center gap-2"><CheckCircle2 size={17} className="text-green-700"/>Email verified and application approved</p>
      <p className="flex items-center gap-2"><Circle size={17} className="text-[#8793a3]"/>Top up credits before accepting bookings</p>
      <p className="flex items-center gap-2"><Circle size={17} className="text-[#8793a3]"/>Your car stays hidden until final review and publication</p>
    </div>
    {showActivation && <section className="mb-6 rounded-xl border border-[#cfe0f8] bg-white p-5"><p className="text-xs font-semibold uppercase tracking-wide text-[#2457d6]">Your chosen plan</p><h2 className="mt-2 text-xl font-semibold">Activate {preferredPlan.name}</h2><p className="mt-2 text-sm leading-6 text-[#68778c]">{peso(Number(preferredPlan.price_php))} per month · up to {preferredPlan.max_active_vehicles} vehicles · {Number(preferredPlan.commission_rate) * 100}% commission</p><Link href={`/owner/plan?choose=${encodeURIComponent(preferredPlan.code)}`} className="mt-4 inline-flex h-11 items-center justify-center rounded-lg bg-[#2457d6] px-4 text-sm font-semibold text-white">Go to Plan</Link></section>}
    <PasswordUpdateForm mode="owner"/>
    <p className="mt-4 text-center text-xs text-[#718096]">You can review your balance in <Link href="/owner/credits" className="font-semibold text-[#2457d6] hover:underline">Credits</Link>.</p>
  </div></main>;
}
