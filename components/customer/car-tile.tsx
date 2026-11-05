import Link from "next/link";
import Image from "next/image";
import { CarFront, Users, Settings2 } from "lucide-react";
import { carPhotoUrl } from "@/lib/car-photo";

type Car = { id:string; brand:string; model:string; year?:number; seats?:number; transmission?:string; car_type?:string; allows_self_drive:boolean; allows_with_driver:boolean; car_photos?:{path:string;sort_order:number}[]; car_rates?:{mode:string;daily_rate:number}[] };

export function CarTile({ car, available }: { car: Car; available?: boolean }) {
  const rates = car.car_rates ?? [];
  const photo = carPhotoUrl([...(car.car_photos ?? [])].sort((a,b)=>a.sort_order-b.sort_order)[0]?.path);
  const enabledRates = rates.filter(rate => rate.mode === "self_drive" ? car.allows_self_drive : car.allows_with_driver);

  return <Link href={`/cars/${car.id}`} className="public-card group block overflow-hidden rounded-2xl border border-[#D6E6F7] bg-white shadow-[0_8px_28px_-22px_rgba(10,61,145,.4)]">
    <div className="relative aspect-[4/3] overflow-hidden bg-[#EAF4FF]">
      {photo ? <Image src={photo} alt={`${car.brand} ${car.model}`} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"/> : <div className="car-photo-placeholder flex h-full items-center justify-center text-[#0B63CE]"><CarFront size={56} strokeWidth={1.2}/></div>}
      {available&&<span className="absolute left-3 top-3 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#0A3D91] shadow-sm">Available</span>}
      {enabledRates.length>0&&<div className="absolute bottom-3 right-3 flex flex-col items-end gap-1">{enabledRates.map(rate=><span key={rate.mode} className="rounded-full bg-[#0B63CE] px-3 py-1.5 text-xs font-semibold text-white shadow-sm">{rate.mode==="self_drive"?"Self-drive":"With driver"} · ₱{Number(rate.daily_rate).toLocaleString()} / day</span>)}</div>}
    </div>
    <div className="p-5"><h3 className="text-lg font-semibold text-[#0F2342]">{car.brand} {car.model}</h3><p className="mt-1 text-xs text-[#51657F]">{[car.year,car.car_type].filter(Boolean).join(" · ")}</p><div className="mt-4 flex flex-wrap gap-2 text-xs text-[#0A3D91]">{car.seats&&<span className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF4FF] px-3 py-2"><Users size={14}/>{car.seats} seats</span>}{car.transmission&&<span className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF4FF] px-3 py-2"><Settings2 size={14}/>{car.transmission}</span>}</div>
    </div>
  </Link>;
}
