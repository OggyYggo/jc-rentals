import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pickupTokenPattern } from "@/lib/pickup/model";
import { lookupPickup } from "@/lib/pickup/lookup";
import { PickupCheck } from "@/components/pickup/PickupCheck";
import Link from "next/link";
import type { StaffBusiness } from "@/lib/staff/context";
import type { PickupLookup } from "@/lib/pickup/model";
import { staffAction } from "@/components/staff/shared";

export const instant = false;
export const metadata = { title: "Pickup pass", robots: { index: false, follow: false }, referrer: "no-referrer" };

const neutral = "This is a Kuyog Bohol pickup pass. Only the vehicle owner or authorized handover staff can use it in the app.";

export default async function NativePickupPage({ params, searchParams }: PageProps<"/p/[token]">) {
  await connection();
  const { token } = await params;
  const credential = { token };
  let lookup: PickupLookup | undefined;
  let staff: StaffBusiness | undefined;
  let choices: StaffBusiness[] = [];
  if (pickupTokenPattern.test(token)) {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) redirect(`/login?next=${encodeURIComponent(`/p/${token}`)}`);
    const { data: owner } = await db.from("owners").select("id").eq("profile_id", user.id).eq("is_active", true).maybeSingle();
    if (owner) lookup = await lookupPickup(db, await headers(), credential).catch(() => undefined);
    else {
      const { data } = await db.rpc("staff_businesses").overrideTypes<StaffBusiness[], { merge: false }>();
      choices = Array.isArray(data) ? data.filter(row => row.enabled) : [];
      const { business } = await searchParams;
      staff = choices.find(row => row.owner_id === business) ?? (choices.length === 1 ? choices[0] : undefined);
      if (staff) {
        const result = await db.rpc("staff_lookup_pickup_pass",{ p_owner:staff.owner_id,p_token:token });
        lookup = result.error ? undefined : result.data as PickupLookup;
      }
    }
  }
  return <main className="mx-auto w-full max-w-lg px-4 py-6">
    <h1 className="mb-4 text-2xl font-bold">Pickup pass</h1>
    {choices.length > 1 && <nav aria-label="Choose your handover business" className="mb-3 flex flex-wrap gap-2">{choices.map(row =>
      <Link key={row.owner_id} prefetch={false} href={`/p/${token}?business=${row.owner_id}`}
        aria-current={row.owner_id === staff?.owner_id ? "true" : undefined} className={staffAction}>{row.business}</Link>
    )}</nav>}
    {lookup && (staff || lookup.result !== "NOT_VALID") ? <PickupCheck lookup={lookup} credential={credential} staff={staff} />
      : <p className="rounded-xl border bg-white p-4 text-sm">{choices.length > 1 ? "Choose the business you’re handing over for." : neutral}</p>}
  </main>;
}
