import Link from "next/link";
import Image from "next/image";
import { Megaphone, MousePointerClick, CalendarCheck } from "lucide-react";
import { PageHeading } from "@/components/owner/ui";
import { getOwnerContext } from "@/lib/owner-context";
import { carPhotoUrl } from "@/lib/car-photo";

export const instant = false;

export default async function PromotePage() {
  const { supabase, owner } = await getOwnerContext();
  const { data: cars, error } = await supabase
    .from("cars")
    .select("id,brand,model,year,is_active,short_code,car_photos(path,thumb_path,sort_order),car_rates(mode,daily_rate)")
    .eq("owner_id", owner.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Could not load your cars for promotion.");
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [clickResult, bookingResult] = await Promise.all([
    supabase.from("promo_clicks").select("id,src").eq("owner_id", owner.id).gte("clicked_at", since),
    supabase.from("bookings").select("id,ref_src").eq("ref_owner_id", owner.id).gte("created_at", since),
  ]);
  const clicks = clickResult.data ?? [];
  const bookings = bookingResult.data ?? [];
  const sources = ["post", "story", "poster", "sticker", "cover", "share"];

  return <>
    <PageHeading eyebrow="Share your listings" title="Promote your rentals" description="Download a ready-made social post with a scannable QR code, or share your booking link directly."/>
    {!process.env.NEXT_PUBLIC_SITE_URL && <div className="mb-5 rounded-lg border border-[#f0dfb9] bg-[#fffaf0] px-4 py-3 text-xs leading-5 text-[#8a6524]">Your public site URL is detected from the current request. Set NEXT_PUBLIC_SITE_URL to your final domain before sharing links or printing promo materials.</div>}
    {!process.env.SUPABASE_SECRET_KEY && <div className="mb-5 rounded-lg border border-[#f0dfb9] bg-[#fffaf0] px-4 py-3 text-xs leading-5 text-[#8a6524]">Promo click tracking is off until the server-only SUPABASE_SECRET_KEY is configured.</div>}
    {(clickResult.error || bookingResult.error) && <div className="mb-5 rounded-lg border border-[#f0dfb9] bg-[#fffaf0] px-4 py-3 text-xs leading-5 text-[#8a6524]">Apply the promo kit database migration to start recording clicks and attributed bookings.</div>}
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><article className="rounded-xl border border-[#e7ecf3] bg-white p-4"><div className="flex items-center justify-between text-[10px] text-[#8793a3]"><span>Promo visits · 30 days</span><MousePointerClick size={15} className="text-[#4c6fc9]"/></div><p className="mt-2 text-xl font-semibold text-[#33445b]">{clicks.length}</p></article><article className="rounded-xl border border-[#e7ecf3] bg-white p-4"><div className="flex items-center justify-between text-[10px] text-[#8793a3]"><span>Promo bookings · 30 days</span><CalendarCheck size={15} className="text-[#39825f]"/></div><p className="mt-2 text-xl font-semibold text-[#33445b]">{bookings.length}</p></article><article className="rounded-xl border border-[#e7ecf3] bg-white p-4"><p className="text-[10px] text-[#8793a3]">Visits by template</p><p className="mt-2 text-xs leading-5 text-[#65738a]">{sources.map((source) => `${source}: ${clicks.filter((click) => click.src === source).length}`).join(" · ")}</p></article><article className="rounded-xl border border-[#e7ecf3] bg-white p-4"><p className="text-[10px] text-[#8793a3]">Bookings by template</p><p className="mt-2 text-xs leading-5 text-[#65738a]">{sources.map((source) => `${source}: ${bookings.filter((booking) => booking.ref_src === source).length}`).join(" · ")}</p></article></div>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dce8f6] bg-[#edf5ff] p-4"><div><h2 className="text-xs font-semibold text-[#33445b]">General brand post</h2><p className="mt-1 text-[10px] text-[#65738a]">Promote the site and let travelers browse all active rentals.</p></div><Link href="/owner/promote/general" className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#c9d9ee] bg-white px-3 text-[11px] font-semibold text-[#4567be]"><Megaphone size={14}/>Open brand kit</Link></div>
    {cars?.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{cars.map((car) => {
      const photo = [...(car.car_photos ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0];
      const photoUrl = carPhotoUrl(photo?.thumb_path ?? photo?.path);
      return <article key={car.id} className="overflow-hidden rounded-xl border border-[#e7ecf3] bg-white shadow-[0_2px_6px_rgba(20,42,78,.025)]">
        <div className="relative h-44 bg-[#edf2ff]">{photoUrl ? <Image src={photoUrl} alt={`${car.brand} ${car.model}`} fill unoptimized sizes="(max-width: 768px) 100vw, 33vw" className="object-cover"/> : <div className="flex h-full items-center justify-center text-[#6680c8]"><Megaphone size={34}/></div>}<span className={`absolute left-3 top-3 rounded-full bg-white px-2.5 py-1 text-[9px] font-semibold ${car.is_active ? "text-[#31805c]" : "text-[#798596]"}`}>{car.is_active ? "Active" : "Hidden"}</span></div>
        <div className="p-4"><h2 className="text-sm font-semibold text-[#33445b]">{car.year ? `${car.year} ` : ""}{car.brand} {car.model}</h2><p className="mt-1 text-[10px] text-[#8b97a8]">{car.short_code ? `Short link: /c/${car.short_code}` : "Promo link is being prepared"}</p><div className="mt-4 flex items-center justify-between gap-3"><span className="text-[10px] text-[#7b899d]">{car.car_rates?.length ?? 0} rental rate{car.car_rates?.length === 1 ? "" : "s"}</span>{car.is_active ? <Link href={`/owner/promote/${car.id}`} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#2457d6] px-3.5 text-[11px] font-semibold text-white"><Megaphone size={14}/>Promote</Link> : <span className="text-[10px] text-[#a15757]">Activate to promote</span>}</div></div>
      </article>;
    })}</div> : <div className="rounded-xl border border-dashed border-[#d8e0eb] bg-white px-6 py-14 text-center"><Megaphone size={25} className="mx-auto text-[#6a83cc]"/><h2 className="mt-3 text-sm font-semibold text-[#43536a]">No rentals to promote yet</h2><p className="mt-1 text-xs text-[#8793a3]">Add a car and set at least one rental rate to create its promo kit.</p><Link href="/owner/cars?new=1" className="mt-4 inline-flex h-9 items-center rounded-lg bg-[#2457d6] px-3.5 text-[11px] font-semibold text-white">Add a car</Link></div>}
  </>;
}
