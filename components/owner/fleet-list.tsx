import Image from "next/image";
import { Bike, CarFront, Eye, EyeOff, Pencil } from "lucide-react";
import { RatingBadge } from "@/components/reviews/ReviewContent";
import { formatPeso } from "@/components/owner/ui";
import type { OwnerCar } from "./car-manager";

const listingStatuses = {
  active: { label: "Active", style: "bg-emerald-50 text-emerald-800" },
  hidden: { label: "Hidden", style: "bg-slate-100 text-slate-700" },
  plan: { label: "Hidden by plan", style: "bg-amber-50 text-amber-900" },
} as const;

type FleetStatus = keyof typeof listingStatuses;

export function fleetStatus(car: OwnerCar): FleetStatus {
  return car.plan_hidden ? "plan" : car.is_active ? "active" : "hidden";
}

function ListingStatus({ car }: { car: OwnerCar }) {
  const listing = listingStatuses[fleetStatus(car)];
  return <span className={`inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${listing.style}`}>
    <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />{listing.label}
  </span>;
}

function VehiclePhoto({ car }: { car: OwnerCar }) {
  const photo = car.car_photos?.reduce<OwnerCar["car_photos"][number] | undefined>(
    (cover, item) => !cover || item.sort_order < cover.sort_order ? item : cover, undefined,
  );
  const Icon = car.vehicle_type === "motorcycle" ? Bike : CarFront;
  return <span className="relative grid h-[60px] w-[72px] shrink-0 place-items-center overflow-hidden rounded-lg bg-[#edf3fb] text-[#547194]">
    {photo?.publicUrl ? <Image src={photo.publicUrl} alt="" fill sizes="72px" unoptimized className="object-cover" /> : <Icon size={25} strokeWidth={1.6} aria-hidden="true" />}
  </span>;
}

function VehicleName({ car }: { car: OwnerCar }) {
  const details = [car.year, car.plate_number, car.car_type || (car.vehicle_type === "motorcycle" ? "Motorcycle" : "Car"), car.transmission].filter(Boolean);
  return <div className="min-w-0">
    <p className="break-words text-sm font-semibold leading-5 text-[#20334e]">{car.brand} {car.model}</p>
    <p className="mt-0.5 break-words text-xs leading-5 text-[#596a83]">{details.join(" · ")}</p>
  </div>;
}

function RentalRates({ car, compact = false }: { car: OwnerCar; compact?: boolean }) {
  const modes = [
    { enabled: car.allows_self_drive, mode: "self_drive", label: "Self-drive" },
    { enabled: car.allows_with_driver, mode: "with_driver", label: "With driver" },
  ].filter(item => item.enabled);
  if (!modes.length) return <p className="text-xs text-[#596a83]">No rental modes set</p>;
  return <dl className={compact ? "flex flex-wrap gap-x-5 gap-y-1.5" : "space-y-1.5"}>
    {modes.map(({ mode, label }) => {
      const rate = car.car_rates.find(item => item.mode === mode)?.daily_rate;
      return <div key={mode} className="min-w-0">
        <dt className="text-xs text-[#596a83]">{label}</dt>
        <dd className="text-sm font-semibold tabular-nums text-[#20334e]">
          {rate ? <>{formatPeso(Number(rate))}<span className="ml-1 text-xs font-normal text-[#596a83]">/ day</span></> : "Rate not set"}
        </dd>
      </div>;
    })}
  </dl>;
}

type ListingProps = { cars: OwnerCar[]; busy: boolean; onEdit: (car: OwnerCar) => void; onToggle: (car: OwnerCar) => void };

function VehicleActions({ car, busy, onEdit, onToggle }: Omit<ListingProps, "cars"> & { car: OwnerCar }) {
  const action = car.is_active ? "Hide" : "Make active";
  const Icon = car.is_active ? EyeOff : Eye;
  const name = `${car.brand} ${car.model}`;
  const buttonClass = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2457d6] disabled:opacity-50 lg:min-h-9";
  return <div className="flex flex-wrap items-center gap-2 lg:justify-end">
    <button type="button" onClick={() => onEdit(car)} disabled={busy} aria-label={`Edit ${name}`} className={`${buttonClass} border border-[#dce5f1] bg-white text-[#254875] hover:bg-[#edf4ff]`}>
      <Pencil size={14} aria-hidden="true" />Edit
    </button>
    <button type="button" disabled={busy} onClick={() => onToggle(car)} aria-label={`${action} ${name}`} className={`${buttonClass} text-[#405775] hover:bg-[#edf4ff]`}>
      <Icon size={15} aria-hidden="true" />{action}
    </button>
  </div>;
}

export function FleetList({ cars, ...actions }: ListingProps) {
  return <>
    <div className="hidden overflow-hidden rounded-2xl border border-[#dce5f1] bg-white lg:block">
      <table className="w-full table-fixed text-left">
        <caption className="sr-only">Fleet vehicles and rental rates</caption>
        <thead className="border-b border-[#e6edf6] bg-[#f1f6fd] text-xs font-semibold text-[#405775]">
          <tr><th scope="col" className="w-[36%] px-4 py-3">Vehicle</th><th scope="col" className="w-[19%] px-3 py-3">Status</th><th scope="col" className="px-3 py-3">Daily rates</th><th scope="col" className="w-[25%] px-4 py-3 text-right">Actions</th></tr>
        </thead>
        <tbody className="divide-y divide-[#e8eef6]">
          {cars.map(car => <tr key={car.id} className="hover:bg-[#f8fbff]">
            <td className="px-4 py-3"><div className="flex items-center gap-3">
              <VehiclePhoto car={car} />
              <div className="min-w-0"><VehicleName car={car} /><div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#596a83]">
                <span>{car.car_photos.length} {car.car_photos.length === 1 ? "photo" : "photos"}</span><RatingBadge average={car.rating_avg} count={car.rating_count} />
              </div></div>
            </div></td>
            <td className="px-3 py-3"><ListingStatus car={car} /></td>
            <td className="px-3 py-3"><RentalRates car={car} /></td>
            <td className="px-4 py-3"><VehicleActions car={car} {...actions} /></td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <ul aria-label="Fleet vehicles" className="space-y-2.5 lg:hidden">
      {cars.map(car => <li key={car.id} className="rounded-xl border border-[#dce5f1] bg-white p-3">
        <div className="flex items-start gap-3">
          <VehiclePhoto car={car} />
          <div className="min-w-0 space-y-1"><VehicleName car={car} /><ListingStatus car={car} /></div>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-[#edf2f8] pt-2">
          <RentalRates car={car} compact />
          <VehicleActions car={car} {...actions} />
        </div>
      </li>)}
    </ul>
  </>;
}
