import { publicMetadata } from "@/lib/site/public-metadata";
import { CarGrid } from "@/components/motion/CarGrid";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CarTile } from "@/components/customer/car-tile";
import { CarFilterRow } from "@/components/cars/CarFilterRow";
import { CarFilterTabs } from "@/components/cars/CarFilterTabs";
import { VehicleFilterTabs } from "@/components/cars/VehicleFilterTabs";
import { Search } from "lucide-react";
import { CarListFilters, CarSearchBar, CarSort } from "@/components/cars/CarListFilters";
import { PublicFooter } from "@/components/public-footer";
import { parseCarSearch, carsUrl } from "@/lib/cars/searchParams";

export const metadata = publicMetadata("/cars", "Cars for Rent in Bohol",
  "Compare cars from local owners across Bohol. Choose a self-drive rental or book a car with a local driver for your trip.");

export const instant = false;
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
type Rate = { mode: string; daily_rate: number };
type Car = {
  rating_avg?: number; rating_count?: number;
  id: string; owner_id?: string; brand: string; model: string; year?: number; seats?: number; transmission?: string; car_type?: string; vehicle_type?: "car" | "motorcycle"; engine_cc?: number | null; helmets_included?: number;
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
  const activeMode = search.vehicle === "motorcycle" && search.mode === "driver" ? undefined : search.mode;
  let cars: Car[] = [];
  let vehicleCounts = { all: 0, car: 0, motorcycle: 0 };
  let loadError = false;

  try {
    const db = await createClient();
    let inventory = db.from("cars")
      .select("id,owner_id,brand,model,year,seats,transmission,car_type,vehicle_type,engine_cc,helmets_included,rating_avg,rating_count,allows_self_drive,allows_with_driver,car_photos(path,thumb_path,sort_order),car_rates(mode,daily_rate)")
      .eq("is_active", true);
    if (search.vehicle) inventory = inventory.eq("vehicle_type", search.vehicle);
    const { data, error } = await inventory.order("created_at", { ascending: false });
    if (error) throw error;
    cars = data ?? [];
    const { data: types } = await db.from("cars").select("vehicle_type").eq("is_active", true);
    vehicleCounts = { all: types?.length ?? 0, car: types?.filter((row) => row.vehicle_type === "car").length ?? 0, motorcycle: types?.filter((row) => row.vehicle_type === "motorcycle").length ?? 0 };
  } catch {
    loadError = true;
  }

  cars = cars.filter((car) => {
    if (search.rating && ((car.rating_count ?? 0) < 3 || Number(car.rating_avg) < search.rating)) return false;
    if (search.type && car.car_type?.toLowerCase() !== search.type.toLowerCase()) return false;
    if (search.seats && Number(car.seats ?? 0) < search.seats) return false;
    if (search.transmission && car.transmission?.toLowerCase() !== search.transmission.toLowerCase()) return false;
    return true;
  });

  if (search.pickup && cars.length) {
    try {
      const db = await createClient();
      const { data, error } = await db.from("public_pickup_search").select("owner_id").ilike("name", `%${search.pickup}%`);
      if (error) throw error;
      const matchingOwners = new Set((data ?? []).map((location) => location.owner_id));
      // Free-form pickup entries (for example, a hotel or airport) may not
      // match an owner's saved service-area label. Keep inventory visible when
      // the lookup has no matches; the pickup text is still passed to booking.
      if (matchingOwners.size) cars = cars.filter((car) => car.owner_id && matchingOwners.has(car.owner_id));
    } catch {
      // Location is an optional hint. A lookup failure should not hide cars.
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
  let shownCars = activeMode ? resultForMode(activeMode) : allCars;
  if (search.sort !== "recommended") shownCars = [...shownCars].sort((a, b) => {
    if (search.sort === "rating") {
      const score = (car: Car) => (car.rating_count ?? 0) >= 3 ? Number(car.rating_avg) : 0;
      return score(b) - score(a) || (b.rating_count ?? 0) - (a.rating_count ?? 0);
    }
    const aPrice = priceFor(a, activeMode) ?? Math.min(priceFor(a, "self") ?? Infinity, priceFor(a, "driver") ?? Infinity);
    const bPrice = priceFor(b, activeMode) ?? Math.min(priceFor(b, "self") ?? Infinity, priceFor(b, "driver") ?? Infinity);
    return search.sort === "price_asc" ? aPrice - bPrice : bPrice - aPrice;
  });

  const resultLabel = search.vehicle === "motorcycle" ? `Showing ${shownCars.length} motorcycles` : activeMode === "driver" ? `Showing ${shownCars.length} cars with a driver` : activeMode === "self" ? `Showing ${shownCars.length} self-drive vehicles` : `Showing all ${shownCars.length} vehicles`;
  const dateNotice = activeMode === "driver" && search.from && search.to && !shownCars.length;

  const price = (value: number) => `₱${value.toLocaleString("en-PH", { maximumFractionDigits: 20 })}`;
  const activeFilters = [
    search.type, search.seats && `${search.seats}+ ${search.vehicle === "motorcycle" ? "passengers" : "seats"}`, search.transmission,
    search.minPrice != null && search.maxPrice != null ? `${price(search.minPrice)} to ${price(search.maxPrice)}`
      : search.minPrice != null ? `From ${price(search.minPrice)}` : search.maxPrice != null ? `Up to ${price(search.maxPrice)}` : null,
    search.rating && `${search.rating}+ stars`,
    search.sort !== "recommended" && ({ price_asc: "Lowest price first", price_desc: "Highest price first", rating: "Highest rated" })[search.sort as "price_asc" | "price_desc" | "rating"],
    search.from && search.to && "Rental dates",
  ].filter(Boolean);
  const searchKey = JSON.stringify(search);
  const recoveryButton = "inline-flex min-h-11 items-center justify-center rounded-xl border px-4 text-center text-sm font-semibold";
  const recovery = `${recoveryButton} border-[#D6E6F7] bg-white text-[#0A3D91] hover:border-[#0B63CE] hover:bg-[#EAF4FF]`;
  const error = <div role="alert" className="rounded-2xl border border-dashed border-[#D6E6F7] bg-[#F3F9FF] p-6 text-center">
    <Search size={28} className="mx-auto mb-3 text-[#0B63CE]" aria-hidden/>
    <h2 className="font-semibold">We couldn’t load cars right now.</h2>
    <Link href={carsUrl(search)} className={`mt-3 ${recovery}`}>Try again</Link>
  </div>;

  return <>
    <main className="theme-public min-h-screen bg-[#F3F9FF] py-4 text-[#0F2342] md:py-10">
      <div className="mx-auto w-full max-w-[1280px] space-y-3 px-5 sm:px-8 md:space-y-4 lg:px-12">
        <header>
          <p className="text-[13px] font-semibold text-[#0B63CE]">Explore Bohol</p>
          <h1 className="mt-1 text-[26px] leading-tight font-semibold md:text-[40px]">Cars and motorcycles for rent in Bohol</h1>
          <p className="mt-1 text-[13px] text-[#5B6F89] md:hidden">Local owners. Go self-drive or book a local driver.</p>
          <p className="mt-2 hidden max-w-[640px] text-sm leading-6 text-[#5B6F89] md:block">Browse rentals from local owners for trips around Panglao and the rest of Bohol. Go at your own pace with a self-drive vehicle, or choose a car with a local driver.</p>
        </header>
        <CarSearchBar search={search} activeCount={activeFilters.length}/>
        {invalidDates && <p role="status" className="rounded-xl bg-[#FFF2D6] px-4 py-3 text-sm text-[#8A5A00]">Please choose valid dates.</p>}
        <div className="grid min-w-0 gap-5 md:grid-cols-[240px_minmax(0,1fr)] lg:grid-cols-[272px_minmax(0,1fr)]">
          <aside aria-label="Vehicle filters" className="hidden min-w-0 md:sticky md:top-24 md:block md:max-h-[calc(100dvh-7rem)] md:self-start md:overflow-y-auto">
            <CarListFilters key={searchKey} search={search}/>
          </aside>
          <div className="min-w-0 space-y-3">
            <CarFilterRow>
              <VehicleFilterTabs current={search.vehicle} counts={vehicleCounts} search={search}/>
              <span aria-hidden className="h-7 w-px shrink-0 bg-[#D6E6F7]"/>
              <CarFilterTabs current={search.vehicle === "motorcycle" ? "self" : activeMode ?? "all"} counts={search.vehicle === "motorcycle" ? { all: counts.self, self: counts.self, driver: 0 } : counts} search={search} motorcycle={search.vehicle === "motorcycle"}/>
              <span aria-hidden className="h-7 w-px shrink-0 bg-[#D6E6F7]"/>
              <CarSort search={search}/>
            </CarFilterRow>
            {search.vehicle === "motorcycle" && search.mode === "driver" && <p role="status" className="text-[13px] text-[#5B6F89]">Motorcycles are self-drive only. Showing self-drive rentals.</p>}
            <p aria-live="polite" className="text-[13px] text-[#5B6F89]">{resultLabel}</p>
            {loadError ? error : shownCars.length ? <CarGrid filterKey={JSON.stringify([search.vehicle, activeMode, search.type, search.transmission, search.sort])}>
              {shownCars.map((car, index) => <CarTile key={car.id} car={car} available={!!search.from && !!search.to} mode={activeMode} searchParams={search}
                listingPrice={priceFor(car, activeMode)} prioritizeCover={index === 0}/>)}
            </CarGrid> : <>
              <div className="rounded-2xl border border-dashed border-[#B7D6F4] bg-white p-5 text-center md:p-9">
                <Search size={28} className="mx-auto mb-3 text-[#0B63CE]" aria-hidden/>
                <h2 className="font-semibold">{search.from && search.to && dateNotice ? "No vehicles on those dates" : "No vehicles match your search."}</h2>
                <p className="mt-2 text-sm text-[#5B6F89]">Try different dates or clear your filters.</p>
                <div className="mx-auto mt-4 grid max-w-md grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-center">
                  <Link href="/#top" className={`${recoveryButton} border-transparent bg-[#0B63CE] text-white hover:bg-[#0A3D91]`}>Change dates</Link>
                  <Link href={carsUrl({ mode: search.mode })} className={recovery}>Clear filters</Link>
                  {search.mode && <Link href="/cars" className={`${recovery} col-span-2`}>See all vehicles</Link>}
                </div>
                {dateNotice && <Link href={carsUrl({ mode: "self", from: search.from, to: search.to, pickup: search.pickup })} className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-[#0B63CE] underline focus-visible:outline-2">Try self-drive instead</Link>}
              </div>
              {!!activeFilters.length && <p className="rounded-xl bg-[#FFF2D6] p-3 text-sm text-[#8A5A00]">Filters on: {activeFilters.join(", ")}</p>}
            </>}
          </div>
        </div>
      </div>
    </main>
    <PublicFooter/>
  </>;
}
