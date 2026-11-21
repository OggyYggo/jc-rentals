import { DateUpdateForm } from "@/components/booking/DateUpdateForm";
import { BookingPolicyDialog } from "@/components/booking/BookingPolicyDialog";
import { CANCELLATION_POLICY_VERSION } from "@/lib/policies/cancellation";
import { cancellationRule } from "@/lib/cancellation";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ListingCancellation } from "@/components/customer/listing-cancellation";
import { readCancellationSettings } from "@/lib/cancellation-settings";
import { CountUp } from "@/components/motion/CountUp";
import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { cookies } from "next/headers";
import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { Bike, CalendarDays, CarFront, Fuel, Settings2, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { carPhotoUrl } from "@/lib/car-photo";
import { AvailabilityCalendar } from "@/components/customer/availability-calendar";
import { CarPhotoCarousel } from "@/components/customer/car-photo-carousel";
import { PublicFooter } from "@/components/public-footer";
import { getPublicPromoCar } from "@/lib/promo/data";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection();
  const { id } = await params;
  const car = await getPublicPromoCar(id);
  if (!car) return { title: "Vehicle rental in Bohol | Kuyog Bohol" };
  const title = `${car.brand} ${car.model}${car.year ? ` ${car.year}` : ""} ${car.vehicle_type === "motorcycle" ? "motorcycle" : "car"} for rent in Bohol | Kuyog Bohol`;
  const rates = car.rates.filter((rate) => rate.mode === "self_drive" ? car.allows_self_drive : car.allows_with_driver);
  const from = rates.length ? Math.min(...rates.map((rate) => Number(rate.daily_rate))) : null;
  const description = `${car.brand} ${car.model} for rent in Bohol${from === null ? "" : ` from ₱${from.toLocaleString()} per day`}. Book online with Kuyog Bohol.`;
  return { title, description, openGraph: { title, description, type: "website" } };
}

export const instant = false;
type Props = { params: Promise<{id:string}>; searchParams: Promise<Record<string, string | string[] | undefined>> };

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function manilaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function firstParam(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }

export default function CarDetail(props: Props) {
  return <Suspense fallback={null}><CarDetailContent {...props} /></Suspense>;
}

import { PublicReviews } from "@/components/reviews/PublicReviews";
import { RatingBadge } from "@/components/reviews/ReviewContent";
import { publicReviewPage } from "@/lib/reviews/public";

type CarRate = {
  mode: string; daily_rate: number; deposit_amount: number; included_hours: number | null;
  overtime_per_hour: number | null; notes: string | null; fuel_policy: string | null;
  mileage_limit: string | null; minimum_age: number | null; license_required: boolean;
  fuel_included: boolean; driver_meals_included: boolean; accommodation_included: boolean; coverage_area: string | null;
};
type Listing = {
  brand: string; model: string; year: number | null; car_type: string | null; vehicle_type: string;
  description: string | null; owner_id: string; rating_avg: number; rating_count: number;
  allows_self_drive: boolean; allows_with_driver: boolean; seats: number | null; engine_cc: number | null;
  helmets_included: number | null; transmission: string | null; fuel_type: string | null;
  car_rates: CarRate[]; car_photos: { path: string; sort_order: number }[];
};

async function CarDetailContent({ params, searchParams }: Props) {
  await connection();
  const { id } = await params;
  const query = await searchParams;
  const requestedModeValue = firstParam(query.mode);
  const requestedMode = requestedModeValue === "driver" || requestedModeValue === "with_driver" ? "with_driver" : "self_drive";
  const rawStart = firstParam(query.from) ?? firstParam(query.start);
  const rawEnd = firstParam(query.to) ?? firstParam(query.end);
  const validDatePair = Boolean(rawStart && rawEnd && isIsoDate(rawStart) && isIsoDate(rawEnd) && rawStart >= manilaToday() && rawEnd > rawStart);
  const invalidSearchDates = Boolean(rawStart || rawEnd) && !validDatePair;
  const start = validDatePair ? rawStart : undefined;
  const end = validDatePair ? rawEnd : undefined;
  const pickup = firstParam(query.pickup)?.trim().slice(0, 80) || undefined;
  const bookingError = firstParam(query.bookingError);
  let db: SupabaseClient;
  let car: Listing | null;
  try {
    db = await createClient();
    const result = await db.from("cars").select("*,car_photos(path,sort_order),car_rates(mode,daily_rate,included_hours,overtime_per_hour,deposit_amount,notes,fuel_policy,mileage_limit,minimum_age,license_required,fuel_included,driver_meals_included,accommodation_included,coverage_area)").eq("id", id).eq("is_active", true).maybeSingle<Listing>();
    car = result.data;
  } catch { notFound(); }
  if (!car) notFound();
  const [reviewPage, distribution, reviewTags, reviewOwner] = await Promise.all([
    publicReviewPage(db, id, "newest"),
    db.from("public_review_distribution").select("rating,total").eq("car_id", id),
    db.from("public_review_tags").select("tag,total").eq("car_id", id).order("total", { ascending: false }),
    db.from("public_review_owners").select("business_name,rating_avg,rating_count").eq("car_id", id).maybeSingle(),
  ]);
  const reviewCount = Number(car.rating_count ?? 0);
  const reviewAverage = Number(car.rating_avg ?? 0);
  const reviewJson = JSON.stringify({
    "@context": "https://schema.org", "@type": "Product", name: `${car.brand} ${car.model}`,
    aggregateRating: { "@type": "AggregateRating", ratingValue: reviewAverage, reviewCount },
  }).replace(/</g, "\\u003c");
  const mode = requestedMode === "with_driver" && car.allows_with_driver ? "with_driver" : requestedMode === "self_drive" && car.allows_self_drive ? "self_drive" : car.allows_with_driver ? "with_driver" : "self_drive";
  const modeUnavailable = mode !== requestedMode;

  const policy = await readCancellationSettings(car.owner_id);
  let customerVerification: { approved: boolean; hasDocuments: boolean } | null = null;
  let motorcycleLicenseAllowed: boolean | null = null;
  try {
    const { data: { user } } = await db.auth.getUser();
    if (user) {
      customerVerification = { approved: false, hasDocuments: false };
      const { data: profile } = await db.from("profiles").select("license_path,id_path,verification,license_classes").eq("id", user.id).maybeSingle();
      if (profile) customerVerification = {
        approved: profile.verification === "approved",
        hasDocuments: Boolean(profile.license_path && profile.id_path),
      };
      if (profile) motorcycleLicenseAllowed = (profile.license_classes ?? []).includes("motorcycle");
    }
  } catch {
    // The booking action checks the verification state again before creating a booking.
  }

  const today = manilaToday();
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

  const rate = car.car_rates?.find((item) => item.mode === mode);
  const days = start && end ? Math.max(1, Math.ceil((new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()) / 86_400_000)) : 0;
  const carListQuery = new URLSearchParams();
  if (start) carListQuery.set("from", start);
  if (end) carListQuery.set("to", end);
  if (requestedModeValue) carListQuery.set("mode", mode === "with_driver" ? "driver" : "self");
  if (pickup) carListQuery.set("pickup", pickup);
  const carListHref = `/cars${carListQuery.size ? `?${carListQuery.toString()}` : ""}`;
  const total = days * Number(rate?.daily_rate ?? 0);
  const deposit = Number(rate?.deposit_amount ?? 0);
  const photos = [...(car.car_photos ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const photoUrls = photos.map((photo) => carPhotoUrl(photo.path)).filter((photo: string | null): photo is string => Boolean(photo));
  const specs: [LucideIcon, string | null][] = car.vehicle_type === "motorcycle" ? [[Users, car.seats ? `${car.seats} passengers` : null], [Bike, car.engine_cc ? `${car.engine_cc} cc` : null], [CarFront, car.helmets_included ? `Helmets included: ${car.helmets_included}` : "No helmets included"], [Settings2, car.transmission], [Fuel, car.fuel_type]] : [[Users, car.seats ? `${car.seats} seats` : null], [Settings2, car.transmission], [CarFront, car.car_type], [Fuel, car.fuel_type]];

  const vehicleType = car.vehicle_type;

  async function book(formData: FormData) {
    "use server";
    const startDate = String(formData.get("start_date") ?? "");
    const endDate = String(formData.get("end_date") ?? "");
    const pickupTime = String(formData.get("pickup_time") ?? "").trim();
    const pickupLocation = String(formData.get("pickup_location") ?? "").trim();
    const itineraryNotes = String(formData.get("itinerary_notes") ?? "").trim();
    const detailUrl = `/cars/${id}?from=${encodeURIComponent(startDate)}&to=${encodeURIComponent(endDate)}&mode=${mode === "with_driver" ? "driver" : "self"}${pickup ? `&pickup=${encodeURIComponent(pickup)}` : ""}`;
    if (!isIsoDate(startDate) || !isIsoDate(endDate) || startDate < manilaToday() || endDate <= startDate) {
      redirect(`${detailUrl}&bookingError=dates`);
    }
    if (formData.get("policy_accepted") !== "1" || formData.get("policy_version") !== CANCELLATION_POLICY_VERSION) {
      redirect(`${detailUrl}&bookingError=policy#booking-summary`);
    }
    if (mode === "with_driver" && (!pickupLocation || !pickupTime || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(pickupTime) || !itineraryNotes)) {
      redirect(`${detailUrl}&bookingError=details`);
    }

    const client = await createClient();
    const {data:{user}} = await client.auth.getUser();
    if (!user) redirect(`/login?next=${encodeURIComponent(detailUrl)}`);

    const { data: profile, error: profileError } = await client.from("profiles").select("role,license_path,id_path,verification,license_classes").eq("id", user.id).maybeSingle();
    if (profileError) redirect(`${detailUrl}&bookingError=retry`);
    if (!profile || profile.role !== "customer" || !profile.license_path || !profile.id_path) {
      redirect(`${detailUrl}&bookingError=documents`);
    }
    if (profile.verification !== "approved") redirect(`${detailUrl}&bookingError=verification`);
    if (mode === "self_drive" && vehicleType === "motorcycle" && !(profile.license_classes ?? []).includes("motorcycle")) redirect(`${detailUrl}&bookingError=license_class`);

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

    const admin = createAdminClient();
    if (!admin) redirect(`${detailUrl}&bookingError=retry#booking-summary`);
    const { data: createdBooking, error: bookingError } = await admin.rpc("create_policy_accepted_booking", {
      p_car_id: id, p_customer_id: user.id, p_mode: mode, p_start: startDate, p_end: endDate,
      p_pickup_time: mode === "with_driver" ? pickupTime : null,
      p_pickup_location: pickupLocation || null, p_itinerary: itineraryNotes || null,
      p_version: CANCELLATION_POLICY_VERSION, p_ref_owner_id: referral.ref_owner_id ?? null,
      p_ref_car_id: referral.ref_car_id ?? null, p_ref_src: referral.ref_src ?? null,
    });
    if (bookingError || !createdBooking) {
      const message = bookingError?.message ?? "";
      const conflict = bookingError?.code === "23P01" || /blocked|overlap/i.test(message);
      const listingUnavailable = /car is unavailable for bookings/i.test(message);
      const error = message.includes("CUSTOMER_VERIFICATION_REQUIRED") ? "verification" : message.includes("BOOKING_POLICY_REQUIRED") ? "policy" : message.includes("CUSTOMER_ARCHIVED") ? "customer_archived" : conflict ? "unavailable" : listingUnavailable ? "listing" : message.includes("LICENSE_CLASS_REQUIRED") ? "license_class" : bookingError?.code === "42501" ? "documents" : "retry";
      redirect(`${detailUrl}&bookingError=${error}#booking-summary`);
    }
    redirect(`/account/bookings/${createdBooking}/pay`);
  }

  const reservation = Math.round(total * Math.max(0.1, Math.min(1, policy.depositRate)) * 100) / 100;
  return <>{reviewCount >= 3 && <script type="application/ld+json">{reviewJson}</script>}<main className="theme-public min-h-screen bg-white px-5 py-8 text-[#0F2342] sm:px-8 md:py-12"><div className="mx-auto max-w-6xl">
    <Link href={carListHref} className="text-sm font-semibold text-[#0B63CE]">← All vehicles</Link>
    <div className="mt-4 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-3xl font-semibold md:text-4xl">{car.brand} {car.model}</h1>{car.vehicle_type === "motorcycle" && <span className="rounded-full bg-[#0A3D91] px-3 py-1 text-xs font-semibold text-white">Motorcycle</span>}<p className="mt-2 text-sm text-[#51657F]">{[car.year,car.car_type].filter(Boolean).join(" · ")}</p></div><div className="flex flex-wrap gap-2">{specs.filter(([, label]) => label !== null).map(([Icon,label], index)=><span key={index} className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF4FF] px-3 py-2 text-xs text-[#0A3D91]"><Icon size={14}/>{label}</span>)}</div></div>
    <div className="mt-6 grid items-start gap-7 lg:grid-cols-[1.45fr_0.85fr]">
      <div className="min-w-0 space-y-6">
        <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-[#EAF4FF]">{photoUrls.length ? <CarPhotoCarousel photos={photoUrls} alt={`${car.brand} ${car.model}`} priority/> : <div className="car-photo-placeholder flex h-full items-center justify-center text-[#0B63CE]"><CarFront size={60} strokeWidth={1.2}/></div>}</div>

        <section className="rounded-2xl border border-[#D6E6F7] bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold text-[#0F2342]">Choose a rental mode</h2><div className="flex rounded-full bg-[#EAF4FF] p-1">{[["self_drive","Self-drive",car.allows_self_drive],["with_driver","With driver",car.allows_with_driver]].filter(([, ,enabled])=>enabled).map(([value,label])=>{const canonicalMode = value === "with_driver" ? "driver" : "self"; const params = new URLSearchParams(); if(start)params.set("from",start);if(end)params.set("to",end);params.set("mode",canonicalMode);if(pickup)params.set("pickup",pickup);return <Link key={String(value)} scroll={false} href={`/cars/${id}?${params}`} className={`rounded-full px-4 py-2 text-xs font-semibold ${value===mode?"bg-[#0B63CE] text-white":"text-[#0A3D91]"}`}>{String(label)}</Link>})}</div></div>
          {modeUnavailable && requestedMode === "with_driver" && <p className="mt-3 text-sm text-[#51657F]">This car is available self-drive only. We switched the mode for you.</p>}
          {rate ? <div className="mt-5 rounded-xl bg-[#F5FAFF] p-4"><p className="text-2xl font-semibold text-[#0A3D91]">₱{Number(rate.daily_rate).toLocaleString()} <span className="text-sm font-medium text-[#51657F]">/ day</span></p>{rate.notes&&<p className="mt-2 text-sm leading-6 text-[#51657F]">{rate.notes}</p>}{mode==="with_driver"&&rate.included_hours&&<p className="mt-2 text-sm text-[#51657F]">{rate.included_hours} hours included{rate.overtime_per_hour?`; overtime ₱${Number(rate.overtime_per_hour).toLocaleString()} per hour`:""}.</p>}</div> : <p className="mt-4 text-sm text-[#51657F]">This mode is not available for this car.</p>}
        </section>

        <section className="rounded-2xl border border-[#D6E6F7] bg-white p-5"><div className="mb-3 flex items-center gap-2"><CalendarDays size={18} className="text-[#0B63CE]"/><h2 className="font-semibold">Availability</h2></div><AvailabilityCalendar today={today} blockedDates={unavailable}/></section>

        <section className="rounded-2xl border border-[#D6E6F7] bg-white p-5"><h2 className="font-semibold text-[#0F2342]">Rental terms</h2>{mode === "self_drive" ? <div className="mt-3 space-y-2 text-sm leading-6 text-[#51657F]"><p>{rate?.license_required ? "A valid driver’s license is required." : "A driver’s license is not required."}</p>{rate?.minimum_age && <p>Minimum driver age: {rate.minimum_age}.</p>}{rate?.fuel_policy && <p>Fuel: {rate.fuel_policy}.</p>}{rate?.mileage_limit && <p>Mileage: {rate.mileage_limit}.</p>}{deposit > 0 && <p>Refundable security deposit: ₱{deposit.toLocaleString()}.</p>}</div> : <div className="mt-3 space-y-2 text-sm leading-6 text-[#51657F]"><p>{rate?.license_required ? "A driver’s license is required." : "No driver’s license is needed."}</p>{rate?.included_hours && <p>{rate.included_hours} hours included{rate.overtime_per_hour ? `; overtime ₱${Number(rate.overtime_per_hour).toLocaleString()} per hour` : ""}.</p>}<p>Fuel {rate?.fuel_included ? "included" : "not included"}; driver meals {rate?.driver_meals_included ? "included" : "not included"}; accommodation {rate?.accommodation_included ? "included" : "not included"}.</p>{rate?.coverage_area && <p>Coverage area: {rate.coverage_area}.</p>}{rate?.notes && <p>{rate.notes}</p>}<p>Share your pickup location and itinerary when arranging the booking.</p></div>}</section>
        {car.description && <section className="rounded-2xl border border-blue-100 p-5">
          <h2 className="font-semibold">About this vehicle</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm">{car.description}</p>
        </section>}
        {reviewOwner.data && <section className="rounded-2xl border border-blue-100 p-5">
          <h2 className="font-semibold">Rental owner</h2><p className="mt-2 break-words">{reviewOwner.data.business_name}</p>
          <RatingBadge average={Number(reviewOwner.data.rating_avg)} count={Number(reviewOwner.data.rating_count)}/>
        </section>}
        <PublicReviews key={id + ":" + reviewCount + ":" + reviewAverage} carId={id} count={reviewCount} average={reviewAverage}
          owner={reviewOwner.data?.business_name ?? "the rental owner"} canReport={customerVerification !== null}
          distribution={distribution.data ?? []} tags={reviewTags.data ?? []} initial={reviewPage}/>
      </div>

      <aside id="booking-summary" className="h-fit scroll-mt-24 rounded-2xl border border-[#D6E6F7] bg-white p-5 shadow-[0_14px_38px_-28px_rgba(10,61,145,.5)] lg:sticky lg:top-24">
        <h2 className="font-semibold text-[#0F2342]">Booking summary</h2>
        <DateUpdateForm path={`/cars/${id}`} from={start} to={end} mode={mode === "with_driver" ? "driver" : "self"} pickup={pickup} today={today} invalid={invalidSearchDates} />
        {days>0&&rate?<div className="mt-5 space-y-3 border-t border-[#D6E6F7] pt-4 text-sm text-[#51657F]"><div className="flex justify-between"><span>{days} day{days===1?"":"s"} × ₱{Number(rate.daily_rate).toLocaleString()}</span><span>₱<CountUp value={total} onChange /></span></div>{mode === "self_drive" && deposit > 0 && <div className="flex items-center justify-between rounded-xl bg-[#EAF4FF] p-3 text-[#0F2342]"><span>Refundable security deposit</span><strong className="text-lg">₱{deposit.toLocaleString()}</strong></div>}<div className="flex justify-between font-semibold text-[#0F2342]"><span>{mode === "self_drive" && deposit > 0 ? "Estimated rental balance" : "Estimated rental total"}</span><span>₱<CountUp value={Math.max(0,total)} onChange /></span></div><p className="text-xs">Estimate only. The server calculates the final price from the owner’s saved rate when you submit a booking request.</p></div>:<p className="mt-4 text-sm text-[#51657F]">Choose dates to see your estimate.</p>}
        {car.vehicle_type === "motorcycle" && <div className="mt-5 rounded-xl bg-[#f5f8ff] p-4 text-xs leading-5 text-[#51657F]"><p className="font-semibold text-[#0F2342]">Before you ride</p><p className="mt-1">Use a verified motorcycle license class, wear a helmet, and follow the fuel, damage, and deposit rules. Maximum two riders.</p></div>}{customerVerification && !customerVerification.approved && <div role="status" className="mt-5 rounded-xl border border-[#f0dfb9] bg-[#fffaf0] p-3.5 text-xs leading-5 text-[#76551b]"><p className="font-semibold">Account verification required before booking</p><p className="mt-1">{customerVerification.hasDocuments ? "Your ID and driver’s license are uploaded. Please wait for your account to be verified before booking." : "Upload your government ID and driver’s license, then wait for your account to be verified before booking."} <Link href="/account/profile" className="font-semibold underline">View account verification</Link></p></div>}
        {car.vehicle_type === "motorcycle" && customerVerification !== null && !motorcycleLicenseAllowed && <div role="status" className="mt-5 rounded-xl border border-[#f0dfb9] bg-[#fffaf0] p-3.5 text-xs leading-5 text-[#76551b]"><p className="font-semibold">Your license is not yet verified for motorcycles.</p><p className="mt-1">Update your documents and we will review it. <Link href="/account/profile" className="font-semibold underline">Update documents</Link></p></div>}
        {mode === "with_driver" && <form action={book} className="mt-5 space-y-3 border-t border-[#D6E6F7] pt-4"><input type="hidden" name="start_date" value={start ?? ""}/><input type="hidden" name="end_date" value={end ?? ""}/><label className="block text-xs font-semibold text-[#0F2342]">Pickup location<input required name="pickup_location" defaultValue={pickup ?? ""} placeholder="Hotel, airport, or address" className="mt-1 h-11 w-full rounded-xl border border-[#D6E6F7] px-3 text-sm font-normal"/></label><ListingCancellation start={start} {...policy} reservation={reservation} withDriver/><label className="block text-xs font-semibold text-[#0F2342]">Itinerary notes<textarea required name="itinerary_notes" rows={3} placeholder="Places you plan to visit and preferred schedule" className="mt-1 w-full rounded-xl border border-[#D6E6F7] px-3 py-2 text-sm font-normal"/></label><BookingPolicyDialog label="Request with driver" disabled={!rate || !start || !end || (customerVerification !== null && !customerVerification.approved)} className="h-12 w-full rounded-full bg-[#0B63CE] text-sm font-semibold text-white hover:bg-[#0A3D91] disabled:opacity-50" summary={cancellationRule(policy.hours, policy.percent)} /><p className="text-center text-xs text-[#51657F]">The driver will confirm the itinerary and any uncovered expenses.</p></form>}
        {mode === "self_drive" && <div className="mt-4"><ListingCancellation start={start} {...policy} reservation={reservation}/></div>}
        {mode === "self_drive" && <form action={book} className="mt-5"><input type="hidden" name="start_date" value={start ?? ""}/><input type="hidden" name="end_date" value={end ?? ""}/><label className="block text-xs font-semibold text-[#0F2342]">Pickup location (optional)<input name="pickup_location" defaultValue={pickup ?? ""} placeholder="Preferred pickup point" className="mt-1 h-11 w-full rounded-xl border border-[#D6E6F7] px-3 text-sm font-normal"/></label><BookingPolicyDialog label="Request self-drive" disabled={!rate || !start || !end || (customerVerification !== null && !customerVerification.approved) || (car.vehicle_type === "motorcycle" && customerVerification !== null && !motorcycleLicenseAllowed)} className="mt-3 h-12 w-full rounded-full bg-[#0B63CE] text-sm font-semibold text-white hover:bg-[#0A3D91] disabled:opacity-50" summary={cancellationRule(policy.hours, policy.percent)} /><p className="mt-3 text-center text-xs text-[#51657F]">A valid driver’s license must be uploaded to your account.</p></form>}
        {bookingError && <div role="alert" className="mt-3 rounded-xl bg-[#fff5f3] p-3 text-xs leading-5 text-[#9a3c30]">{bookingError === "customer_archived" ? "Your account cannot make new bookings right now. Contact us for help." : bookingError === "policy" ? "Please accept the cancellation policy to continue." : bookingError === "details" ? "Add a pickup location, pickup time, and itinerary notes to continue." : bookingError === "dates" ? "Choose valid rental dates starting today or later." : bookingError === "documents" ? <>Bookings require your government ID and driver’s license. <Link href="/account/profile" className="font-semibold underline">Upload your documents</Link>.</> : bookingError === "license_class" ? <>Your license is not yet verified for motorcycles. <Link href="/account/profile" className="font-semibold underline">Update your documents</Link>.</> : bookingError === "verification" ? <>Your documents are on file, but your account must be verified before booking. <Link href="/account/profile" className="font-semibold underline">Check verification status</Link>.</> : bookingError === "unavailable" ? "Those dates are no longer available. Choose another date range." : bookingError === "listing" ? "This listing isn’t accepting bookings right now. Please choose another car or contact the owner." : "We couldn’t verify availability right now. Please try again."}</div>}
        <p className="mt-3 text-center text-xs text-[#51657F]">Final pricing is calculated server-side from the owner’s saved rate. Browser-submitted price values are never used.</p>
      </aside>
    </div>
  </div></main><PublicFooter/></>;
}
