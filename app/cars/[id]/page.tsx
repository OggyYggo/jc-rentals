import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { CalendarDays, CarFront, Fuel, Gauge, Settings2, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { carPhotoUrl } from "@/lib/car-photo";
import { AvailabilityCalendar } from "@/components/customer/availability-calendar";
import { PublicFooter } from "@/components/public-footer";
import { getPublicPromoCar } from "@/lib/promo/data";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const car = await getPublicPromoCar(id);
  if (!car) return { title: "Car rental in Bohol | Kuyog Bohol" };
  const title = `${car.brand} ${car.model}${car.year ? ` ${car.year}` : ""} for rent in Bohol | Kuyog Bohol`;
  const rates = car.rates.filter((rate) => rate.mode === "self_drive" ? car.allows_self_drive : car.allows_with_driver);
  const from = rates.length ? Math.min(...rates.map((rate) => Number(rate.daily_rate))) : null;
  const description = `${car.brand} ${car.model} for rent in Bohol${from === null ? "" : ` from ₱${from.toLocaleString()} per day`}. Book online with Kuyog Bohol.`;
  return { title, description, openGraph: { title, description, type: "website" } };
}

export const instant = false;
type Props = { params: Promise<{id:string}>; searchParams: Promise<{start?:string;end?:string;mode?:string;bookingError?:string}> };

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function manilaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export default async function CarDetail({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  await connection();
  const mode = query.mode === "with_driver" ? "with_driver" : "self_drive";
  let db: any;
  let car: any = null;
  try {
    db = await createClient();
    const result = await db.from("cars").select("*,car_photos(path,sort_order),car_rates(mode,daily_rate,included_hours,overtime_per_hour,deposit_amount,notes,fuel_policy,mileage_limit,minimum_age,license_required,fuel_included,driver_meals_included,accommodation_included,coverage_area)").eq("id", id).eq("is_active", true).maybeSingle();
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
      db.from("public_car_blocked_dates").select("start_date,end_date").eq("car_id", id).lte("start_date", windowEnd).gte("end_date", today),
      db.from("public_car_booking_dates").select("start_date,end_date").eq("car_id", id).lte("start_date", windowEnd).gte("end_date", today),
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

  async function book(formData: FormData) {
    "use server";
    const startDate = String(formData.get("start_date") ?? "");
    const endDate = String(formData.get("end_date") ?? "");
    const pickupTime = String(formData.get("pickup_time") ?? "").trim();
    const pickupLocation = String(formData.get("pickup_location") ?? "").trim();
    const itineraryNotes = String(formData.get("itinerary_notes") ?? "").trim();
    const detailUrl = `/cars/${id}?start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}&mode=${mode}`;
    if (!isIsoDate(startDate) || !isIsoDate(endDate) || startDate < manilaToday() || endDate < startDate) {
      redirect(`${detailUrl}&bookingError=dates`);
    }
    if (mode === "with_driver" && (!pickupLocation || !pickupTime || !/^\d{2}:\d{2}$/.test(pickupTime) || !itineraryNotes)) {
      redirect(`${detailUrl}&bookingError=details`);
    }

    const client = await createClient();
    const {data:{user}} = await client.auth.getUser();
    if (!user) redirect(`/login?next=${encodeURIComponent(detailUrl)}`);

    if (mode === "self_drive") {
      const { data: profile, error: profileError } = await client.from("profiles").select("license_path,id_path,verification").eq("id", user.id).maybeSingle();
      if (profileError) redirect(`${detailUrl}&bookingError=retry`);
      if (!profile?.license_path || !profile.id_path || !["pending", "approved"].includes(profile.verification)) {
        redirect(`${detailUrl}&bookingError=documents`);
      }
    }

    const [{ data: blocks, error: blocksError }, { data: booked, error: bookingsError }] = await Promise.all([
      client.from("public_car_blocked_dates").select("start_date,end_date").eq("car_id", id).lte("start_date", endDate).gte("end_date", startDate),
      client.from("public_car_booking_dates").select("start_date,end_date").eq("car_id", id).lte("start_date", endDate).gte("end_date", startDate),
    ]);
    if (blocksError || bookingsError) redirect(`${detailUrl}&bookingError=retry`);
    if ((blocks?.length ?? 0) || (booked?.length ?? 0)) redirect(`${detailUrl}&bookingError=unavailable`);

    // Send only booking choices. The database insert trigger fetches the saved rate
    // and calculates the authoritative total, deposit, commission, and owner earnings.
    let referral: { ref_owner_id?: string; ref_car_id?: string; ref_src?: string } = {};
    try {
      const rawReferral = (await cookies()).get("kb_ref")?.value;
      const saved = rawReferral ? JSON.parse(rawReferral) as { o?: string; c?: string; s?: string } : null;
      const allowedSources = ["post", "story", "poster", "sticker", "cover", "share"];
      if (saved?.o && saved.c && saved.s && allowedSources.includes(saved.s)) {
        const { data: referredCar } = await client.from("cars").select("id,owner_id").eq("id", saved.c).eq("owner_id", saved.o).maybeSingle();
        if (referredCar) referral = { ref_owner_id: referredCar.owner_id, ref_car_id: referredCar.id, ref_src: saved.s };
      }
    } catch {
      // A missing or invalid attribution cookie does not block a booking.
    }

    const { error: bookingError } = await client.from("bookings").insert({
      car_id: id,
      customer_id: user.id,
      mode,
      start_date: startDate,
      end_date: endDate,
      pickup_time: pickupTime || null,
      pickup_location: pickupLocation || null,
      itinerary_notes: itineraryNotes || null,
      ...referral,
    });
    if (bookingError) {
      const conflict = bookingError.code === "23P01" || /blocked|overlap|unavailable/i.test(bookingError.message);
      redirect(`${detailUrl}&bookingError=${conflict ? "unavailable" : bookingError.code === "42501" ? "documents" : "retry"}`);
    }
    redirect("/account/bookings");
  }

  return <><main className="theme-public min-h-screen bg-white px-5 py-8 text-[#0F2342] sm:px-8 md:py-12"><div className="mx-auto max-w-6xl">
    <Link href="/cars" className="text-sm font-semibold text-[#0B63CE]">← All cars</Link>
    <div className="mt-4 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-3xl font-semibold md:text-4xl">{car.brand} {car.model}</h1><p className="mt-2 text-sm text-[#51657F]">{[car.year,car.car_type].filter(Boolean).join(" · ")}</p></div><div className="flex flex-wrap gap-2">{specs.map(([Icon,label]:any)=><span key={label} className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF4FF] px-3 py-2 text-xs text-[#0A3D91]"><Icon size={14}/>{label}</span>)}</div></div>
    <div className="mt-6 grid items-start gap-7 lg:grid-cols-[1.45fr_0.85fr]">
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3">{photos.length ? photos.slice(0,4).map((photo:any,index:number)=><div key={photo.path} className={`relative aspect-[4/3] overflow-hidden rounded-2xl bg-[#EAF4FF] ${index===0?"col-span-2":""}`}><Image src={carPhotoUrl(photo.path) ?? ""} alt={`${car.brand} ${car.model} ${index===0?"main view":"photo"}`} fill unoptimized sizes={index===0?"(max-width: 1024px) 100vw, 65vw":"(max-width: 640px) 50vw, 32vw"} priority={index===0} className="object-cover"/></div>) : <div className="car-photo-placeholder col-span-2 flex aspect-[16/9] items-center justify-center rounded-2xl text-[#0B63CE]"><CarFront size={60} strokeWidth={1.2}/></div>}</div>

        <section className="rounded-2xl border border-[#D6E6F7] bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold text-[#0F2342]">Choose a rental mode</h2><div className="flex rounded-full bg-[#EAF4FF] p-1">{[["self_drive","Self-drive",car.allows_self_drive],["with_driver","With driver",car.allows_with_driver]].filter(([, ,enabled])=>enabled).map(([value,label])=><Link key={value as string} href={`/cars/${id}?${new URLSearchParams({start:query.start??"",end:query.end??"",mode:value as string})}`} className={`rounded-full px-4 py-2 text-xs font-semibold ${value===mode?"bg-[#0B63CE] text-white":"text-[#0A3D91]"}`}>{label as string}</Link>)}</div></div>
          {rate ? <div className="mt-5 rounded-xl bg-[#F5FAFF] p-4"><p className="text-2xl font-semibold text-[#0A3D91]">₱{Number(rate.daily_rate).toLocaleString()} <span className="text-sm font-medium text-[#51657F]">/ day</span></p>{rate.notes&&<p className="mt-2 text-sm leading-6 text-[#51657F]">{rate.notes}</p>}{mode==="with_driver"&&rate.included_hours&&<p className="mt-2 text-sm text-[#51657F]">{rate.included_hours} hours included{rate.overtime_per_hour?`; overtime ₱${Number(rate.overtime_per_hour).toLocaleString()} per hour`:""}.</p>}</div> : <p className="mt-4 text-sm text-[#51657F]">This mode is not available for this car.</p>}
        </section>

        <section className="rounded-2xl border border-[#D6E6F7] bg-white p-5"><div className="mb-3 flex items-center gap-2"><CalendarDays size={18} className="text-[#0B63CE]"/><h2 className="font-semibold">Availability</h2></div><AvailabilityCalendar today={today} blockedDates={unavailable}/></section>

        <section className="rounded-2xl border border-[#D6E6F7] bg-white p-5"><h2 className="font-semibold text-[#0F2342]">Rental terms</h2>{mode === "self_drive" ? <div className="mt-3 space-y-2 text-sm leading-6 text-[#51657F]"><p>{rate?.license_required ? "A valid driver’s license is required." : "A driver’s license is not required."}</p>{rate?.minimum_age && <p>Minimum driver age: {rate.minimum_age}.</p>}{rate?.fuel_policy && <p>Fuel: {rate.fuel_policy}.</p>}{rate?.mileage_limit && <p>Mileage: {rate.mileage_limit}.</p>}{rate?.deposit_amount > 0 && <p>Refundable security deposit: ₱{Number(rate.deposit_amount).toLocaleString()}.</p>}</div> : <div className="mt-3 space-y-2 text-sm leading-6 text-[#51657F]"><p>{rate?.license_required ? "A driver’s license is required." : "No driver’s license is needed."}</p>{rate?.included_hours && <p>{rate.included_hours} hours included{rate.overtime_per_hour ? `; overtime ₱${Number(rate.overtime_per_hour).toLocaleString()} per hour` : ""}.</p>}<p>Fuel {rate?.fuel_included ? "included" : "not included"}; driver meals {rate?.driver_meals_included ? "included" : "not included"}; accommodation {rate?.accommodation_included ? "included" : "not included"}.</p>{rate?.coverage_area && <p>Coverage area: {rate.coverage_area}.</p>}{rate?.notes && <p>{rate.notes}</p>}<p>Share your pickup location and itinerary when arranging the booking.</p></div>}</section>
      </div>

      <aside className="h-fit rounded-2xl border border-[#D6E6F7] bg-white p-5 shadow-[0_14px_38px_-28px_rgba(10,61,145,.5)] lg:sticky lg:top-24"><h2 className="font-semibold text-[#0F2342]">Booking summary</h2><form action={`/cars/${id}`} className="mt-4 grid grid-cols-2 gap-3 text-xs"><input type="hidden" name="mode" value={mode}/><label className="font-semibold text-[#0F2342]">Pickup<input required name="start" type="date" min={today} defaultValue={query.start} className="mt-1 h-11 w-full rounded-xl border border-[#D6E6F7] bg-white px-2 text-sm font-normal"/></label><label className="font-semibold text-[#0F2342]">Return<input required name="end" type="date" min={query.start||today} defaultValue={query.end} className="mt-1 h-11 w-full rounded-xl border border-[#D6E6F7] bg-white px-2 text-sm font-normal"/></label><button className="col-span-2 min-h-11 rounded-full border border-[#0B63CE] text-sm font-semibold text-[#0B63CE]">Update dates</button></form>
        {days>0&&rate?<div className="mt-5 space-y-3 border-t border-[#D6E6F7] pt-4 text-sm text-[#51657F]"><div className="flex justify-between"><span>{days} day{days===1?"":"s"} × ₱{Number(rate.daily_rate).toLocaleString()}</span><span>₱{total.toLocaleString()}</span></div>{mode === "self_drive" && deposit > 0 && <div className="flex items-center justify-between rounded-xl bg-[#EAF4FF] p-3 text-[#0F2342]"><span>Refundable security deposit</span><strong className="text-lg">₱{deposit.toLocaleString()}</strong></div>}<div className="flex justify-between font-semibold text-[#0F2342]"><span>{mode === "self_drive" && deposit > 0 ? "Estimated rental balance" : "Estimated rental total"}</span><span>₱{Math.max(0,total).toLocaleString()}</span></div><p className="text-xs">Estimate only. The server calculates the final price from the owner’s saved rate when you submit a booking request.</p></div>:<p className="mt-4 text-sm text-[#51657F]">Choose dates to see your estimate.</p>}
        {mode === "with_driver" && <form action={book} className="mt-5 space-y-3 border-t border-[#D6E6F7] pt-4"><input type="hidden" name="start_date" value={query.start ?? ""}/><input type="hidden" name="end_date" value={query.end ?? ""}/><label className="block text-xs font-semibold text-[#0F2342]">Pickup location<input required name="pickup_location" placeholder="Hotel, airport, or address" className="mt-1 h-11 w-full rounded-xl border border-[#D6E6F7] px-3 text-sm font-normal"/></label><label className="block text-xs font-semibold text-[#0F2342]">Pickup time<input required name="pickup_time" type="time" className="mt-1 h-11 w-full rounded-xl border border-[#D6E6F7] px-3 text-sm font-normal"/></label><label className="block text-xs font-semibold text-[#0F2342]">Itinerary notes<textarea required name="itinerary_notes" rows={3} placeholder="Places you plan to visit and preferred schedule" className="mt-1 w-full rounded-xl border border-[#D6E6F7] px-3 py-2 text-sm font-normal"/></label><button disabled={!rate || !query.start || !query.end} className="h-12 w-full rounded-full bg-[#0B63CE] text-sm font-semibold text-white hover:bg-[#0A3D91] disabled:opacity-50">Request with driver</button><p className="text-center text-xs text-[#51657F]">The driver will confirm the itinerary and any uncovered expenses.</p></form>}
        {mode === "self_drive" && <form action={book} className="mt-5"><input type="hidden" name="start_date" value={query.start ?? ""}/><input type="hidden" name="end_date" value={query.end ?? ""}/><label className="block text-xs font-semibold text-[#0F2342]">Pickup location (optional)<input name="pickup_location" placeholder="Preferred pickup point" className="mt-1 h-11 w-full rounded-xl border border-[#D6E6F7] px-3 text-sm font-normal"/></label><button disabled={!rate || !query.start || !query.end} className="mt-3 h-12 w-full rounded-full bg-[#0B63CE] text-sm font-semibold text-white hover:bg-[#0A3D91] disabled:opacity-50">Request self-drive</button><p className="mt-3 text-center text-xs text-[#51657F]">A valid driver’s license must be uploaded to your account.</p></form>}
        {query.bookingError && <div role="alert" className="mt-3 rounded-xl bg-[#fff5f3] p-3 text-xs leading-5 text-[#9a3c30]">{query.bookingError === "details" ? "Add a pickup location, pickup time, and itinerary notes to continue." : query.bookingError === "dates" ? "Choose valid rental dates starting today or later." : query.bookingError === "documents" ? <>Self-drive bookings require both documents with verification pending or approved. <Link href="/account/profile" className="font-semibold underline">Upload your documents</Link>.</> : query.bookingError === "unavailable" ? "Those dates are no longer available. Choose another date range." : "We couldn’t verify availability right now. Please try again."}</div>}
        <p className="mt-3 text-center text-xs text-[#51657F]">Final pricing is calculated server-side from the owner’s saved rate. Browser-submitted price values are never used.</p>
      </aside>
    </div>
  </div></main><PublicFooter/></>;
}
