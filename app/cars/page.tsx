import { createClient } from "@/lib/supabase/server";
import { CarTile } from "@/components/customer/car-tile";
import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { PublicFooter } from "@/components/public-footer";

export const instant = false;
type Props = { searchParams: Promise<{start?:string;end?:string;mode?:string;type?:string;seats?:string;transmission?:string;minPrice?:string;maxPrice?:string}> };

function Filters({ query, mode }: { query: Awaited<Props["searchParams"]>; mode: string }) {
  return <form action="/cars" className="flex flex-wrap items-end gap-3 text-xs">
    {query.start&&<input type="hidden" name="start" value={query.start}/>} {query.end&&<input type="hidden" name="end" value={query.end}/>}
    <label className="font-semibold text-[#0F2342]">Mode<select name="mode" defaultValue={mode} className="mt-1 block h-11 rounded-xl border border-[#D6E6F7] bg-white px-3 font-normal"><option value="self_drive">Self-drive</option><option value="with_driver">With driver</option></select></label>
    <label className="font-semibold text-[#0F2342]">Car type<input name="type" defaultValue={query.type} placeholder="Any type" className="mt-1 block h-11 w-32 rounded-xl border border-[#D6E6F7] bg-white px-3 font-normal"/></label>
    <label className="font-semibold text-[#0F2342]">Seats<input type="number" name="seats" min="1" defaultValue={query.seats} placeholder="Any" className="mt-1 block h-11 w-24 rounded-xl border border-[#D6E6F7] bg-white px-3 font-normal"/></label>
    <label className="font-semibold text-[#0F2342]">Transmission<select name="transmission" defaultValue={query.transmission} className="mt-1 block h-11 rounded-xl border border-[#D6E6F7] bg-white px-3 font-normal"><option value="">Any</option><option>Automatic</option><option>Manual</option></select></label>
    <label className="font-semibold text-[#0F2342]">Min ₱/day<input type="number" name="minPrice" min="0" defaultValue={query.minPrice} className="mt-1 block h-11 w-24 rounded-xl border border-[#D6E6F7] bg-white px-3 font-normal"/></label>
    <label className="font-semibold text-[#0F2342]">Max ₱/day<input type="number" name="maxPrice" min="0" defaultValue={query.maxPrice} className="mt-1 block h-11 w-24 rounded-xl border border-[#D6E6F7] bg-white px-3 font-normal"/></label>
    <button className="h-11 rounded-full bg-[#0B63CE] px-5 font-semibold text-white hover:bg-[#0A3D91]">Apply filters</button>
  </form>;
}

export default async function CarsPage({ searchParams }: Props) {
  const q = await searchParams;
  const mode = q.mode === "with_driver" ? "with_driver" : "self_drive";
  let cars: any[] = [];
  try {
    const db = await createClient();
    let query = db.from("cars").select("id,brand,model,year,seats,transmission,car_type,allows_self_drive,allows_with_driver,car_photos(path,thumb_path,sort_order),car_rates(mode,daily_rate)").eq("is_active", true).order("created_at", { ascending: false });
    if (q.type) query = query.eq("car_type", q.type);
    if (q.seats) query = query.gte("seats", Number(q.seats));
    if (q.transmission) query = query.eq("transmission", q.transmission);
    const { data } = await query;
    cars = (data ?? []).filter(car => (mode === "self_drive" ? car.allows_self_drive : car.allows_with_driver));
    if (q.start && q.end && cars.length) {
      const ids = cars.map(car => car.id);
      const [{data:blocks},{data:bookings}] = await Promise.all([
        db.from("public_car_blocked_dates").select("car_id").in("car_id",ids).lte("start_date",q.end).gte("end_date",q.start),
        db.from("public_car_booking_dates").select("car_id").in("car_id",ids).lte("start_date",q.end).gte("end_date",q.start),
      ]);
      const unavailable = new Set([...(blocks??[]),...(bookings??[])].map(item=>item.car_id));
      cars = cars.filter(car=>!unavailable.has(car.id));
    }
    cars = cars.filter(car=>{
      const rates=(car.car_rates??[]).filter((rate:any)=>rate.mode===mode).map((rate:any)=>Number(rate.daily_rate));
      if (!rates.length) return false;
      return (!q.minPrice || Math.max(...rates)>=Number(q.minPrice)) && (!q.maxPrice || Math.min(...rates)<=Number(q.maxPrice));
    });
  } catch {}
  return <><main className="theme-public min-h-screen bg-white px-5 py-10 text-[#0F2342] sm:px-8 md:py-14"><div className="mx-auto max-w-6xl"><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#0B63CE]">Explore Bohol</p><h1 className="mt-2 text-3xl font-semibold md:text-4xl">Cars for your trip</h1>
    <form action="/cars" className="mt-6 grid gap-3 rounded-2xl border border-[#D6E6F7] bg-[#F5FAFF] p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><label className="text-xs font-semibold text-[#0F2342]">Pickup date<input name="start" type="date" defaultValue={q.start} className="mt-1 block h-11 w-full rounded-xl border border-[#D6E6F7] bg-white px-3 text-sm"/></label><label className="text-xs font-semibold text-[#0F2342]">Return date<input name="end" type="date" defaultValue={q.end} className="mt-1 block h-11 w-full rounded-xl border border-[#D6E6F7] bg-white px-3 text-sm"/></label><button className="h-11 rounded-full bg-[#0B63CE] px-6 text-sm font-semibold text-white hover:bg-[#0A3D91]">Update dates</button><input type="hidden" name="mode" value={mode}/></form>
    <details className="mobile-filters mt-4 rounded-xl border border-[#D6E6F7] bg-white p-4 md:hidden"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold text-[#0A3D91]"><SlidersHorizontal size={17}/> Filters</summary><div className="mt-3"><Filters query={q} mode={mode}/></div></details>
    <div className="mt-4 hidden rounded-2xl border border-[#D6E6F7] bg-[#EAF4FF] p-4 md:block"><Filters query={q} mode={mode}/></div>
    {cars.length ? <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{cars.map(car=><CarTile key={car.id} car={car} available={!!q.start&&!!q.end}/>)}</div> : <div className="mt-10 rounded-2xl border border-dashed border-[#B7D6F4] bg-[#F5FAFF] p-10 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#EAF4FF] text-[#0B63CE]"><SlidersHorizontal/></div><h2 className="mt-4 font-semibold text-[#0F2342]">{q.start&&q.end?"No cars free on those dates. Try different days or switch mode.":"Cars are being added. Check back soon."}</h2>{(q.start||q.end||q.type||q.seats||q.transmission||q.minPrice||q.maxPrice)&&<Link href="/cars" className="mt-3 inline-block text-sm font-semibold text-[#0B63CE]">Clear filters</Link>}</div>}
  </div></main><PublicFooter/></>;
}
