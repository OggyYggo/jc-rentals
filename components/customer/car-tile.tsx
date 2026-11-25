import Link from "next/link";
import { ArrowRight, CarFront, Users, Settings2, Bike } from "lucide-react";
import { carPhotoUrl } from "@/lib/car-photo";
import type { CarSearch } from "@/lib/cars/searchParams";
import { CarPhotoCarousel } from "@/components/customer/car-photo-carousel";

import { RatingBadge } from "@/components/reviews/ReviewContent";

type Car = {
  rating_avg?: number;
  rating_count?: number;
  id: string;
  brand: string;
  model: string;
  year?: number;
  seats?: number;
  transmission?: string;
  car_type?: string;
  vehicle_type?: "car" | "motorcycle";
  engine_cc?: number | null;
  helmets_included?: number;
  allows_self_drive: boolean;
  allows_with_driver: boolean;
  car_photos?: { path: string; thumb_path?: string | null; sort_order: number }[];
  car_rates?: { mode: string; daily_rate: number }[];
};

type SearchFilters = Pick<CarSearch, "from" | "to" | "mode" | "pickup" | "seats" | "sort" | "type" | "transmission" | "vehicle">;

export function CarTile({ car, available, mode, searchParams, listingPrice, prioritizeCover }: { car: Car; available?: boolean; mode?: "self" | "driver"; searchParams?: SearchFilters; listingPrice?: number | null; prioritizeCover?: boolean }) {
  const rates = (car.car_rates ?? []).filter(rate => rate.mode === "self_drive" ? car.allows_self_drive : car.allows_with_driver);
  const visibleRates = mode === "self" ? rates.filter(rate => rate.mode === "self_drive") : mode === "driver" ? rates.filter(rate => rate.mode === "with_driver") : rates;
  const photos = [...(car.car_photos ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => carPhotoUrl(item.thumb_path ?? item.path))
    .filter((photo): photo is string => Boolean(photo));
  const params = new URLSearchParams();
  for (const key of ["from", "to", "mode", "pickup", "seats", "sort", "type", "transmission", "vehicle"] as const) {
    const value = searchParams?.[key];
    if (value) params.set(key, String(value));
  }
  const href = `/cars/${car.id}${params.size ? `?${params.toString()}` : ""}`;

  if (listingPrice !== undefined) {
    const name = `${car.brand} ${car.model}${car.year ? ` ${car.year}` : ""}`;
    const motorcycle = car.vehicle_type === "motorcycle";
    const description = [car.car_type, motorcycle ? car.engine_cc ? `${car.engine_cc} cc` : null : car.transmission].filter(Boolean).join(" · ");
    const hasRating = (car.rating_count ?? 0) >= 3 && car.rating_avg != null;
    return <article className="motion-car-card group relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-[#D6E6F7] bg-white shadow-sm">
      <Link href={href} aria-label={`View ${name}`} className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-3 focus-visible:-outline-offset-4 focus-visible:outline-[#0B63CE]"/>
      <div className="motion-car-image relative aspect-[16/10] overflow-hidden bg-[#EAF4FF]">
        {photos.length ? <CarPhotoCarousel photos={photos} alt={`${name} for rent in Bohol`} listing prioritizeCover={prioritizeCover}/> : <div className="car-photo-placeholder grid h-full place-items-center text-[#0B63CE]"><CarFront size={49} strokeWidth={1.2} aria-hidden/></div>}
        {available && <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-white px-2.5 py-1 text-[13px] font-semibold text-[#12703A]">Available</span>}
        {motorcycle && <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-[#0A3D91] px-2.5 py-1 text-[13px] font-semibold text-white">Motorcycle</span>}
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
          <div className="min-w-0 flex-1"><h2 className="break-words text-[19px] leading-tight font-semibold text-[#0F2342]">{name}</h2>{description && <p className="mt-1 text-[13px] text-[#5B6F89]">{description}</p>}</div>
          {hasRating ? <RatingBadge average={car.rating_avg} count={car.rating_count}/> : !car.rating_count && <span className="rounded-full bg-[#EAF4FF] px-2 py-1 text-[13px] font-semibold text-[#0A3D91]">New</span>}
        </div>
        <div className="mt-2 mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-[#5B6F89]">
          {!!car.seats && <span className="inline-flex items-center gap-1"><Users size={15} aria-hidden/>{car.seats} {motorcycle ? "passengers" : "seats"}</span>}
          {motorcycle && !!car.helmets_included && <span className="inline-flex items-center gap-1"><Bike size={15} aria-hidden/>{car.helmets_included} helmet{car.helmets_included === 1 ? "" : "s"}</span>}
          {car.transmission && <span className="inline-flex items-center gap-1"><Settings2 size={15} aria-hidden/>{car.transmission}</span>}
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-[#E3EEF9] pt-2.5">
          <div className="min-w-0">
            {listingPrice !== null && <p className="text-[13px] text-[#5B6F89]">From <strong className="text-lg text-[#0F2342]">₱{listingPrice.toLocaleString("en-PH", { maximumFractionDigits: 20 })}</strong> /day</p>}
            <div className="mt-1 flex flex-wrap gap-1 text-[13px] font-semibold text-[#0A3D91]">{car.allows_self_drive && <span className="rounded-full bg-[#EAF4FF] px-2 py-0.5">Self-drive</span>}{car.allows_with_driver && <span className="rounded-full bg-[#EAF4FF] px-2 py-0.5">With driver</span>}</div>
          </div>
          <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-[#0B63CE] text-white group-hover:bg-[#0A3D91]"><ArrowRight size={20}/></span>
        </div>
      </div>
    </article>;
  }

  return <article className="motion-car-card group block overflow-hidden rounded-3xl border border-[#D6E6F7] bg-white shadow-[0_8px_28px_-22px_rgba(10,61,145,.4)]">
    <div className="motion-car-image relative aspect-[4/3] overflow-hidden bg-[#EAF4FF]">
      {photos.length ? <CarPhotoCarousel photos={photos} alt={`${[car.brand, car.model, car.year].filter(Boolean).join(" ")} for rent in Bohol`} /> : <div className="car-photo-placeholder flex h-full items-center justify-center text-[#0B63CE]"><CarFront size={56} strokeWidth={1.2} /></div>}
      <Link href={href} aria-label={`View ${car.brand} ${car.model}`} className="absolute inset-0 z-10" />
      {available && <span className="pointer-events-none absolute left-3 top-3 z-10 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#0A3D91] shadow-sm">Available</span>}
      {car.vehicle_type === "motorcycle" && <span className="pointer-events-none absolute right-3 top-3 z-10 rounded-full bg-[#0A3D91] px-3 py-1.5 text-xs font-semibold text-white shadow-sm">Motorcycle</span>}
      {visibleRates.length > 0 && <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex flex-col items-start gap-1">{visibleRates.map(rate => <span key={rate.mode} className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#0F2342] shadow-sm">{rate.mode === "self_drive" ? "Self-drive" : "With driver"} from ₱{Number(rate.daily_rate).toLocaleString("en-PH")} / day</span>)}</div>}
    </div>
    <Link href={href} className="block p-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#0B63CE]">
      <h3 className="text-lg font-semibold text-[#0F2342]">{car.brand} {car.model}</h3>
      <p className="mt-1 text-xs text-[#51657F]">{[car.year, car.car_type].filter(Boolean).join(" · ")}</p>
      <RatingBadge average={car.rating_avg} count={car.rating_count}/>
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#0A3D91]">
        {car.seats && <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF4FF] px-3 py-2"><Users size={14} />{car.seats} {car.vehicle_type === "motorcycle" ? "passengers" : "seats"}</span>}
        {car.engine_cc && <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF4FF] px-3 py-2">{car.engine_cc} cc</span>}
        {car.vehicle_type === "motorcycle" && (car.helmets_included ?? 0) > 0 && <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF4FF] px-3 py-2">{car.helmets_included} helmet{car.helmets_included === 1 ? "" : "s"}</span>}
        {car.transmission && <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF4FF] px-3 py-2"><Settings2 size={14} />{car.transmission}</span>}
      </div>
      <span className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#0B63CE] text-sm font-semibold text-white transition-colors group-hover:bg-[#0A3D91]">View {car.vehicle_type === "motorcycle" ? "motorcycle" : "vehicle"}<ArrowRight size={15} aria-hidden="true" /></span>
    </Link>
  </article>;
}
