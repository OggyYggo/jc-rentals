import Link from "next/link";
import { ArrowRight, CarFront, Users, Settings2 } from "lucide-react";
import { carPhotoUrl } from "@/lib/car-photo";
import type { CarSearch } from "@/lib/cars/searchParams";
import { CarPhotoCarousel } from "@/components/customer/car-photo-carousel";

type Car = {
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

export function CarTile({ car, available, mode, searchParams }: { car: Car; available?: boolean; mode?: "self" | "driver"; searchParams?: SearchFilters }) {
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

  return <article className="motion-car-card group block overflow-hidden rounded-3xl border border-[#D6E6F7] bg-white shadow-[0_8px_28px_-22px_rgba(10,61,145,.4)]">
    <div className="motion-car-image relative aspect-[4/3] overflow-hidden bg-[#EAF4FF]">
      {photos.length ? <CarPhotoCarousel photos={photos} alt={`${car.brand} ${car.model}`} /> : <div className="car-photo-placeholder flex h-full items-center justify-center text-[#0B63CE]"><CarFront size={56} strokeWidth={1.2} /></div>}
      <Link href={href} aria-label={`View ${car.brand} ${car.model}`} className="absolute inset-0 z-10" />
      {available && <span className="pointer-events-none absolute left-3 top-3 z-10 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#0A3D91] shadow-sm">Available</span>}
      {car.vehicle_type === "motorcycle" && <span className="pointer-events-none absolute right-3 top-3 z-10 rounded-full bg-[#0A3D91] px-3 py-1.5 text-xs font-semibold text-white shadow-sm">Motorcycle</span>}
      {visibleRates.length > 0 && <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex flex-col items-start gap-1">{visibleRates.map(rate => <span key={rate.mode} className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#0F2342] shadow-sm">{rate.mode === "self_drive" ? "Self-drive" : "With driver"} from ₱{Number(rate.daily_rate).toLocaleString("en-PH")} / day</span>)}</div>}
    </div>
    <Link href={href} className="block p-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#0B63CE]">
      <h3 className="text-lg font-semibold text-[#0F2342]">{car.brand} {car.model}</h3>
      <p className="mt-1 text-xs text-[#51657F]">{[car.year, car.car_type].filter(Boolean).join(" · ")}</p>
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
