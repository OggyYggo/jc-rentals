import { Megaphone } from "lucide-react";
import Link from "next/link";
import { PageHeading } from "@/components/owner/ui";
import { getAdminContext } from "@/lib/admin-context";

export const instant = false;

export default async function PromotionsPage() {
  const { supabase } = await getAdminContext();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: owners, error: ownersError }, { data: clicks, error: clicksError }, { data: bookings, error: bookingsError }, { data: cars, error: carsError }] = await Promise.all([
    supabase.from("owners").select("id,business_name,is_active").order("business_name"),
    supabase.from("promo_clicks").select("owner_id,src").gte("clicked_at", since).limit(10000),
    supabase.from("bookings").select("ref_owner_id,ref_src").not("ref_owner_id", "is", null).gte("created_at", since).limit(10000),
    supabase.from("cars").select("id,owner_id,brand,model,year").eq("is_active", true).order("brand"),
  ]);
  const setupError = ownersError || clicksError || bookingsError || carsError;

  return <>
    <PageHeading eyebrow="Owner activity" title="Promo performance" description="Referral clicks and bookings by owner and promo format for the last 30 days. Promo referrals do not change the platform commission."/>
    {!process.env.SUPABASE_SECRET_KEY && <div className="mb-5 rounded-lg border border-[#f0dfb9] bg-[#fffaf0] px-4 py-3 text-xs leading-5 text-[#8a6524]">Promo click tracking is off until the server-only SUPABASE_SECRET_KEY is configured.</div>}
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dce8f6] bg-[#edf5ff] p-4"><div><h2 className="text-xs font-semibold text-[#33445b]">General brand post</h2><p className="mt-1 text-[10px] text-[#65738a]">Download the site-wide post or create a car-specific promo.</p></div><Link href="/admin/promotions/general" className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#c9d9ee] bg-white px-3 text-[11px] font-semibold text-[#4567be]"><Megaphone size={14}/>Open brand kit</Link></div>
    {setupError && <div className="mb-5 rounded-lg border border-[#f0dfb9] bg-[#fffaf0] px-4 py-3 text-xs leading-5 text-[#8a6524]">Apply the promo kit database migration to enable campaign stats.</div>}
    <div className="space-y-3">{owners?.map((owner) => {
      const ownerClicks = (clicks ?? []).filter((row) => row.owner_id === owner.id);
      const ownerBookings = (bookings ?? []).filter((row) => row.ref_owner_id === owner.id);
      const sources = ["post", "story", "poster", "sticker", "cover", "share"];
      const split = sources.map((src) => `${src}: ${ownerClicks.filter((row) => row.src === src).length}`).join(" · ");
      const bookingSplit = sources.map((src) => `${src}: ${ownerBookings.filter((row) => row.ref_src === src).length}`).join(" · ");
      const ownerCars = (cars ?? []).filter((car) => car.owner_id === owner.id);
      return <article key={owner.id} className="rounded-xl border border-[#e7ecf3] bg-white p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-[#33445b]">{owner.business_name}</h2><p className="mt-1 text-[10px] text-[#8793a3]">{owner.is_active ? "Active owner" : "Inactive owner"}</p></div><Megaphone size={18} className="text-[#4c6fc9]"/></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-lg bg-[#f7f9fc] p-3"><p className="text-[10px] text-[#8793a3]">Short-link visits</p><p className="mt-1 text-lg font-semibold text-[#33445b]">{ownerClicks.length}</p></div><div className="rounded-lg bg-[#f7f9fc] p-3"><p className="text-[10px] text-[#8793a3]">Attributed bookings</p><p className="mt-1 text-lg font-semibold text-[#33445b]">{ownerBookings.length}</p></div></div><p className="mt-3 text-[10px] leading-5 text-[#65738a]">Visits by format · {split}</p><p className="mt-1 text-[10px] leading-5 text-[#65738a]">Bookings by format · {bookingSplit}</p>{ownerCars.length > 0 && <div className="mt-4 border-t border-[#edf0f4] pt-3"><p className="mb-2 text-[10px] font-semibold text-[#65738a]">Active car promo kits</p><div className="flex flex-wrap gap-2">{ownerCars.map((car) => <Link key={car.id} href={`/admin/promotions/${car.id}`} className="rounded-lg border border-[#dfe5ec] px-2.5 py-2 text-[10px] font-medium text-[#4567be] hover:bg-[#f5f7fb]">{car.year ? `${car.year} ` : ""}{car.brand} {car.model}</Link>)}</div></div>}</article>;
    })}</div>
    {!owners?.length && !setupError && <div className="rounded-xl border border-dashed border-[#d8e0eb] bg-white px-6 py-14 text-center text-xs text-[#8793a3]">No owners have been added yet.</div>}
  </>;
}
