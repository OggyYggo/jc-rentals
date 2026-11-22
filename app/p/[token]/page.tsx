import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pickupTokenPattern } from "@/lib/pickup/model";
import { lookupPickup } from "@/lib/pickup/lookup";
import { PickupCheck } from "@/components/pickup/PickupCheck";

export const instant = false;
export const metadata = { title: "Pickup pass", robots: { index: false, follow: false }, referrer: "no-referrer" };

const neutral = "This is a Kuyog Bohol pickup pass. Only the vehicle owner can use it in the app.";

export default async function NativePickupPage({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const credential = { token };
  let lookup;
  if (pickupTokenPattern.test(token)) {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) redirect(`/login?next=${encodeURIComponent(`/p/${token}`)}`);
    const { data: owner } = await db.from("owners").select("id").eq("profile_id", user.id).eq("is_active", true).maybeSingle();
    if (owner) lookup = await lookupPickup(db, await headers(), credential).catch(() => undefined);
  }
  return <main className="mx-auto w-full max-w-lg px-4 py-6">
    <h1 className="mb-4 text-2xl font-bold">Pickup pass</h1>
    {lookup && lookup.result !== "NOT_VALID" ? <PickupCheck lookup={lookup} credential={credential} /> : <p className="rounded-xl border bg-white p-4 text-sm">{neutral}</p>}
  </main>;
}
