import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CarTile } from "@/components/customer/car-tile";
import { CarFilterTabs } from "@/components/cars/CarFilterTabs";
import { CarListFilters } from "@/components/cars/CarListFilters";
import { PublicFooter } from "@/components/public-footer";
import { parseCarSearch, carsUrl } from "@/lib/cars/searchParams";

export const instant = false;
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
type Rate = { mode: string; daily_rate: number };
type Car = {
  id: string; owner_id?: string; brand: string; model: string; year?: number; seats?: number; transmission?: string; car_type?: string;
  allows_self_drive: boolean; allows_with_driver: boolean;
  car_photos?: { path: string; thumb_path?: string | null; sort_order: number }[];
  car_rates?: Rate[];
};

function priceFor(car: Car, mode?: "self" | "driver") {
  const rates = (car.car_rates ?? []).filter((rate) => mode === "self"
    ? rate.mode === "self_drive" && car.allows_self_drive
    : mode === "driver" ? rate.mode === "with_driver" && car.allows_with_driver
      : rate.mode === "self_drive" ? car.allows_self_drive : car.allows_with_driver);
  const prices = rates.map((rate) => Number(rate.daily_rate)).filter((rate) => Number.isFinite(rate) && rate > 0);
  return prices.length ? Math.min(...prices) : null;
}

export default async function CarsPage({ searchParams }: Props) {
  const { search, invalidDates } = parseCarSearch(await searchParams);
  let cars: Car[] = [];
  let loadError = false;

  try {
    const db = await createClient();
    const { data, error } = await db.from("cars")
      .select("id,owner_id,brand,model,year,seats,transmission,car_type,allows_self_drive,allows_with_driver,car_photos(path,thumb_path,sort_order),car_rates(mode,daily_rate)")
      .eq("is_active", true).order("created_at", { ascending: false });
    if (error) throw error;
    cars = data ?? [];
  } catch {
    loadError = true;
  }

  cars = cars.filter((car) => {
    if (search.type && car.car_type?.toLowerCase() !== search.type.toLowerCase()) return false;
    if (search.seats && Number(car.seats ?? 0) < search.seats) return false;
    if (search.transmission && car.transmission?.toLowerCase() !== search.transmission.toLowerCase()) return false;
    return true;
  });

  if (search.pickup && cars.length) {
    try {
      const db = await createClient();
      const { data, error } = await db.from("pickup_locations").select("owner_id").ilike("name", `%${search.pickup}%`);
      if (error) throw error;
      const matchingOwners = new Set((data ?? []).map((location) => location.owner_id));
      cars = cars.filter((car) => car.owner_id && matchingOwners.has(car.owner_id));
    } catch {
      loadError = true;
      cars = [];
    }
  }

  if (search.from && search.to && cars.length) {
    try {
      const db = await createClient();
      const ids = cars.map((car) => car.id);
      const [{ data: blocks, error: blocksError }, { data: bookings, error: bookingsError }] = await Promise.all([
        db.from("public_car_blocked_dates").select("car_id").in("car_id", ids).lte("start_date", search.to).gte("end_date", search.from),
        db.from("public_car_booking_dates").select("car_id").in("car_id", ids).lte("start_date", search.to).gte("end_date", search.from),
      ]);
      if (blocksError || bookingsError) throw blocksError ?? bookingsError;
      const unavailable = new Set([...(blocks ?? []), ...(bookings ?? [])].map((item) => item.car_id));
      cars = cars.filter((car) => !unavailable.has(car.id));
    } catch {
      loadError = true;
      cars = [];
    }
  }

  const inPriceRange = (price: number | null) => price != null && (search.minPrice == null || price >= search.minPrice) && (search.maxPrice == null || price <= search.maxPrice);
  const resultForMode = (mode?: "self" | "driver") => cars.filter((car) => inPriceRange(priceFor(car, mode)));
  const allCars = cars.filter((car) => inPriceRange(priceFor(car, "self")) || inPriceRange(priceFor(car, "driver")));
  const counts = { all: allCars.length, self: resultForMode("self").length, driver: resultForMode("driver").length };
  let shownCars = search.mode ? resultForMode(search.mode) : allCars;
  if (search.sort !== "recommended") shownCars = [...shownCars].sort((a, b) => {
    const aPrice = priceFor(a, search.mode) ?? Math.min(priceFor(a, "self") ?? Infinity, priceFor(a, "driver") ?? Infinity);
    const bPrice = priceFor(b, search.mode) ?? Math.min(priceFor(b, "self") ?? Infinity, priceFor(b, "driver") ?? Infinity);
    return search.sort === "price_asc" ? aPrice - bPrice : bPrice - aPrice;
  });

  const resultLabel = search.mode === "driver" ? `Showing ${shownCars.length} cars with a driver` : search.mode === "self" ? `Showing ${shownCars.length} self-drive cars` : `Showing all ${shownCars.length} cars`;
  const dateNotice = search.mode === "driver" && search.from && search.to && !shownCars.length;

  return <><main className="theme-public min-h-screen bg-white px-5 py-10 text-[#0F2342] sm:px-8 md:py-14"><div className="mx-auto max-w-6xl">
    <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#0B63CE]">Explore Bohol</p><h1 className="mt-2 text-3xl font-semibold md:text-4xl">Cars for your trip</h1>
    {invalidDates && <p role="status" className="mt-4 rounded-xl bg-[#fff7e8] px-4 py-3 text-sm text-[#76551b]">Please choose valid dates.</p>}
    <CarFilterTabs current={search.mode ?? "all"} counts={counts} search={search}/>
    {search.pickup && <p className="mt-4 text-xs text-[#51657F]">Pickup: {search.pickup}</p>}
    <details className="mobile-filters mt-4 rounded-xl border border-[#D6E6F7] bg-white p-4 md:hidden"><summary className="flex min-h-11 cursor-pointer list-none items-center font-semibold text-[#0A3D91]">Filters</summary><div className="mt-3"><CarListFilters search={search}/></div></details>
    <div className="mt-4 hidden rounded-2xl border border-[#D6E6F7] bg-[#EAF4FF] p-4 md:block"><CarListFilters search={search}/></div>
    <p aria-live="polite" className="mt-6 text-sm text-[#51657F]">{resultLabel}</p>
    {loadError ? <div role="alert" className="mt-5 rounded-2xl border border-[#D6E6F7] p-10 text-center"><p className="font-semibold">We couldn’t load cars right now.</p><Link href={carsUrl(search)} className="mt-3 inline-flex text-sm font-semibold text-[#0B63CE] underline">Try again</Link></div> : shownCars.length ? <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{shownCars.map((car) => <CarTile key={car.id} car={car} available={!!search.from && !!search.to} mode={search.mode} searchParams={search}/>)}</div> : <div className="mt-5 rounded-2xl border border-dashed border-[#B7D6F4] bg-[#F5FAFF] p-10 text-center"><h2 className="font-semibold text-[#0F2342]">{dateNotice ? "No cars with a driver on those dates." : "No cars match your search."}</h2><div className="mt-4 flex flex-wrap justify-center gap-3">{dateNotice && <><Link href={carsUrl({ mode: "self", from: search.from, to: search.to, pickup: search.pickup })} className="rounded-full bg-[#0B63CE] px-5 py-2.5 text-sm font-semibold text-white">Try self-drive</Link><Link href="/#top" className="rounded-full border border-[#0B63CE] px-5 py-2.5 text-sm font-semibold text-[#0B63CE]">Change dates</Link></>}<Link href={carsUrl({ mode: search.mode })} className="rounded-full border border-[#0B63CE] px-5 py-2.5 text-sm font-semibold text-[#0B63CE]">Clear filters</Link><Link href="/cars" className="rounded-full border border-[#0B63CE] px-5 py-2.5 text-sm font-semibold text-[#0B63CE]">See all cars</Link></div></div>}
  </div></main><PublicFooter/></>;
}
