import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, CarFront, Fuel, Gauge, Settings2, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { carPhotoUrl } from "@/lib/car-photo";
import { AvailabilityCalendar } from "@/components/customer/availability-calendar";
import { PublicFooter } from "@/components/public-footer";

export const instant = false;
type Props = { params: Promise<{id:string}>; searchParams: Promise<{start?:string;end?:string;mode?:string}> };

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }

export default async function CarDetail({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const mode = query.mode === "with_driver" ? "with_driver" : "self_drive";
  let db: any;
  let car: any = null;
  try {
    db = await createClient();
    const result = await db.from("cars").select("*,car_photos(path,sort_order),car_rates(mode,daily_rate,included_hours,overtime_per_hour,deposit_amount,notes)").eq("id", id).eq("is_active", true).maybeSingle();
    car = result.data;
  } catch {}
  if (!car) notFound();

  const today = isoDate(new Date());
  const windowEndDate = new Date(`${today}T00:00:00`);
  windowEndDate.setDate(windowEndDate.getDate() + 120);
  const windowEnd = isoDate(windowEndDate);
  const unavailable: string[] = [];
  try {
    const [{data:blocks},{data:bookings}] = await Promise.all([
      db.from("car_blocked_dates").select("start_date,end_date").eq("car_id", id).lte("start_date", windowEnd).gte("end_date", today),
      db.from("bookings").select("start_date,end_date").eq("car_id", id).in("status", ["pending","confirmed","picked_up"]).lte("start_date", windowEnd).gte("end_date", today),
    ]);
    for (const period of [...(blocks ?? []), ...(bookings ?? [])]) {
      const from = new Date(`${period.start_date < today ? today : period.start_date}T00:00:00`);
      const until = new Date(`${period.end_date > windowEnd ? windowEnd : period.end_date}T00:00:00`);
      for (const day = from; day <= until; day.setDate(day.getDate() + 1)) unavailable.push(isoDate(day));
    }
  } catch {}

  const rate = car.car_rates?.find((item: any) => item.mode === mode);
  const days = query.start && query.end ? Math.max(1, Math.ceil((new Date(`${query.end}T00:00:00`).getTime() - new Date(`${query.start}T00:00:00`).getTime()) / 86_400_000)) : 0;
  const total = days * Number(rate?.daily_rate ?? 0);
  const deposit = Number(rate?.deposit_amount ?? 0);
  const photos = [...(car.car_photos ?? [])].sort((a: any,b: any) => a.sort_order - b.sort_order);
  const specs = [[Users, car.seats ? `${car.seats} seats` : null], [Settings2, car.transmission], [CarFront, car.car_type], [Fuel, car.fuel_type]].filter((entry: any) => entry[1]);

  async function book() {
    "use server";
    const client = await createClient();
    const {data:{user}} = await client.auth.getUser();
    if (!user) redirect(`/login?next=${encodeURIComponent(`/cars/${id}?start=${query.start ?? ""}&end=${query.end ?? ""}&mode=${mode}`)}`);
    redirect("/account/bookings");
  }

  return <><main className="theme-public min-h-screen bg-white px-5 py-8 text-[#0F2342] sm:px-8 md:py-12"><div className="mx-auto max-w-6xl">
    <Link href="/cars" className="text-sm font-semibold text-[#0B63CE]">← All cars</Link>
    <div className="mt-4 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-3xl font-semibold md:text-4xl">{car.brand} {car.model}</h1><p className="mt-2 text-sm text-[#51657F]">{[car.year,car.car_type].filter(Boolean).join(" · ")}</p></div><div className="flex flex-wrap gap-2">{specs.map(([Icon,label]:any)=><span key={label} className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF4FF] px-3 py-2 text-xs text-[#0A3D91]"><Icon size={14}/>{label}</span>)}</div></div>
    <div className="mt-6 grid items-start gap-7 lg:grid-cols-[1.45fr_0.85fr]">
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3">{photos.length ? photos.slice(0,4).map((photo:any,index:number)=><div key={photo.path} className={`relative aspect-[4/3] overflow-hidden rounded-2xl bg-[#EAF4FF] ${index===0?"col-span-2":""}`}><Image src={carPhotoUrl(photo.path) ?? ""} alt={`${car.brand} ${car.model} ${index===0?"main view":"photo"}`} fill sizes={index===0?"(max-width: 1024px) 100vw, 65vw":"(max-width: 640px) 50vw, 32vw"} priority={index===0} className="object-cover"/></div>) : <div className="car-photo-placeholder col-span-2 flex aspect-[16/9] items-center justify-center rounded-2xl text-[#0B63CE]"><CarFront size={60} strokeWidth={1.2}/></div>}</div>

        <section className="rounded-2xl border border-[#D6E6F7] bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold text-[#0F2342]">Choose a rental mode</h2><div className="flex rounded-full bg-[#EAF4FF] p-1">{[["self_drive","Self-drive",car.allows_self_drive],["with_driver","With driver",car.allows_with_driver]].filter(([, ,enabled])=>enabled).map(([value,label])=><Link key={value as string} href={`/cars/${id}?${new URLSearchParams({start:query.start??"",end:query.end??"",mode:value as string})}`} className={`rounded-full px-4 py-2 text-xs font-semibold ${value===mode?"bg-[#0B63CE] text-white":"text-[#0A3D91]"}`}>{label as string}</Link>)}</div></div>
          {rate ? <div className="mt-5 rounded-xl bg-[#F5FAFF] p-4"><p className="text-2xl font-semibold text-[#0A3D91]">₱{Number(rate.daily_rate).toLocaleString()} <span className="text-sm font-medium text-[#51657F]">/ day</span></p>{rate.notes&&<p className="mt-2 text-sm leading-6 text-[#51657F]">{rate.notes}</p>}{mode==="with_driver"&&rate.included_hours&&<p className="mt-2 text-sm text-[#51657F]">{rate.included_hours} hours included{rate.overtime_per_hour?`; overtime ₱${Number(rate.overtime_per_hour).toLocaleString()} per hour`:""}.</p>}</div> : <p className="mt-4 text-sm text-[#51657F]">This mode is not available for this car.</p>}
        </section>

        <section className="rounded-2xl border border-[#D6E6F7] bg-white p-5"><div className="mb-3 flex items-center gap-2"><CalendarDays size={18} className="text-[#0B63CE]"/><h2 className="font-semibold">Availability</h2></div><AvailabilityCalendar today={today} blockedDates={unavailable}/></section>

        <section className="rounded-2xl border border-[#D6E6F7] bg-white p-5"><h2 className="font-semibold text-[#0F2342]">Rental policies</h2>{[["Deposit",rate?.deposit_amount?`Deposit: ₱${Number(rate.deposit_amount).toLocaleString()}. TODO: confirm deposit and refund policy.`:"TODO: confirm deposit and refund policy."],["Fuel and mileage","Check the listing details with the owner. TODO: confirm standard terms."],["Cancellation","TODO: confirm cancellation policy."],["Overtime","For with-driver rentals, see the included hours and overtime rate above. TODO: confirm policy."],["Pickup","Pickup location is confirmed after booking."]].map(([title,description])=><details key={title} className="border-b border-[#D6E6F7] py-3 last:border-0"><summary className="min-h-10 cursor-pointer py-2 text-sm font-medium">{title}</summary><p className="pb-2 text-sm leading-6 text-[#51657F]">{description}</p></details>)}</section>
      </div>

      <aside className="h-fit rounded-2xl border border-[#D6E6F7] bg-white p-5 shadow-[0_14px_38px_-28px_rgba(10,61,145,.5)] lg:sticky lg:top-24"><h2 className="font-semibold text-[#0F2342]">Booking summary</h2><form action={`/cars/${id}`} className="mt-4 grid grid-cols-2 gap-3 text-xs"><input type="hidden" name="mode" value={mode}/><label className="font-semibold text-[#0F2342]">Pickup<input required name="start" type="date" min={today} defaultValue={query.start} className="mt-1 h-11 w-full rounded-xl border border-[#D6E6F7] bg-white px-2 text-sm font-normal"/></label><label className="font-semibold text-[#0F2342]">Return<input required name="end" type="date" min={query.start||today} defaultValue={query.end} className="mt-1 h-11 w-full rounded-xl border border-[#D6E6F7] bg-white px-2 text-sm font-normal"/></label><button className="col-span-2 min-h-11 rounded-full border border-[#0B63CE] text-sm font-semibold text-[#0B63CE]">Update dates</button></form>
        {days>0&&rate?<div className="mt-5 space-y-3 border-t border-[#D6E6F7] pt-4 text-sm text-[#51657F]"><div className="flex justify-between"><span>{days} day{days===1?"":"s"} × ₱{Number(rate.daily_rate).toLocaleString()}</span><span>₱{total.toLocaleString()}</span></div><div className="flex items-center justify-between rounded-xl bg-[#EAF4FF] p-3 text-[#0F2342]"><span>Deposit due now</span><strong className="text-lg">₱{deposit.toLocaleString()}</strong></div><div className="flex justify-between font-semibold text-[#0F2342]"><span>Balance at pickup</span><span>₱{Math.max(0,total-deposit).toLocaleString()}</span></div></div>:<p className="mt-4 text-sm text-[#51657F]">Choose dates to see your estimate.</p>}
        <form action={book}><button disabled={!rate} className="mt-5 h-12 w-full rounded-full bg-[#0B63CE] text-sm font-semibold text-white hover:bg-[#0A3D91] disabled:opacity-50">Book this car</button></form><p className="mt-3 text-center text-xs text-[#51657F]">Final pricing is confirmed from the listing when booking.</p>
      </aside>
    </div>
  </div></main><PublicFooter/></>;
}
