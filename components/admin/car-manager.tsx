"use client";

import { EntityHistory } from "@/components/admin/audit/EntityHistory";

import { runWithAlerts } from "@/lib/alerts/run";
import Link from "next/link";
import Image from "next/image";
import { carPhotoUrl } from "@/lib/car-photo";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CarFront, Search } from "lucide-react";
import { AdminFilterChips, mobileAction, mobileCard, adminMoney } from "@/components/admin/ui";
import { createClient } from "@/lib/supabase/client";

export type AdminCarRow = { id: string; brand: string; model: string; year: number | null; plate_number: string | null; car_type: string | null; vehicle_type: "car" | "motorcycle"; engine_cc: number | null; helmets_included: number; transmission: string | null; is_active: boolean; allows_self_drive: boolean; allows_with_driver: boolean; owner: { id: string; business_name: string } | null; car_rates: { mode: string; daily_rate: number }[]; car_photos: { path: string; thumb_path: string | null; sort_order: number }[] };

export function CarManager({ cars }: { cars: AdminCarRow[] }) {
  const router = useRouter();
  const details = useRef<HTMLDialogElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = cars.find(car => car.id === selectedId);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [vehicleType, setVehicleType] = useState("all");
  const [owner, setOwner] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const owners = Array.from(new Map(cars.flatMap(car => car.owner ? [[car.owner.id, car.owner.business_name] as const] : [])))
    .sort((a, b) => a[1].localeCompare(b[1]));
  const searched = useMemo(() => cars.filter(car =>
    `${car.brand} ${car.model} ${car.owner?.business_name ?? ""} ${car.plate_number ?? ""}`.toLowerCase().includes(search.trim().toLowerCase())
    && (owner === "all" || car.owner?.id === owner)), [cars, search, owner]);
  const filtered = searched.filter(car => (status === "all" || String(car.is_active) === status)
    && (vehicleType === "all" || car.vehicle_type === vehicleType));
  const visible = cars.filter(car => car.is_active).length;
  const filters = [
    { value: "all", label: "All", count: searched.length },
    { value: "true", label: "Active", count: searched.filter(car => car.is_active).length },
    { value: "false", label: "Hidden", count: searched.filter(car => !car.is_active).length },
    { value: "car", label: "Cars", count: searched.filter(car => car.vehicle_type === "car").length },
    { value: "motorcycle", label: "Motorcycles", count: searched.filter(car => car.vehicle_type === "motorcycle").length },
  ];

  function toggleActive(car: AdminCarRow) {
    return runWithAlerts({
      confirm: {
        title: car.is_active ? "Deactivate this vehicle?" : "Reactivate this vehicle?",
        text: car.is_active ? `${car.brand} ${car.model} will disappear from customer search.` : `${car.brand} ${car.model}`,
        confirmText: car.is_active ? "Deactivate vehicle" : "Reactivate vehicle",
        danger: car.is_active,
      },
      setPending: (pending) => setBusyId(pending ? car.id : null),
      run: async () => {
        const { error } = await createClient().from("cars").update({ is_active: !car.is_active }).eq("id", car.id);
        if (error) throw error;
      },
      success: car.is_active ? "Vehicle deactivated" : "Vehicle reactivated",
      refresh: router.refresh,
    });
  }

  const field = "min-h-11 rounded-lg border border-[#D6E6F7] bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-[#0A47B1]";
  function visibility(car: AdminCarRow) {
    return <button type="button" role="switch" aria-checked={car.is_active} aria-label={`Show ${car.brand} ${car.model} to customers`}
      disabled={busyId !== null} onClick={() => toggleActive(car)} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">
      <span aria-hidden className={`flex h-6 w-11 items-center rounded-full p-1 ${car.is_active ? "justify-end bg-[#0A47B1]" : "bg-[#5B6F89]"}`}><span className="size-4 rounded-full bg-white"/></span>
      <span className="hidden lg:inline">{car.is_active ? "Visible" : "Hidden"}</span>
    </button>;
  }
  function view(car: AdminCarRow) {
    return <button type="button" aria-haspopup="dialog" className={mobileAction} onClick={() => {
      setSelectedId(car.id);
      details.current?.showModal();
    }}>View<span className="sr-only"> {car.brand} {car.model}</span></button>;
  }

  return <div className="space-y-4">
    <section aria-label="Vehicle summary" className="hidden grid-cols-4 gap-3 lg:grid">
      {([["Vehicles", cars.length], ["Visible to customers", visible], ["Hidden", cars.length - visible], ["Need attention", cars.filter(car => car.car_photos.length < 3).length]] as const).map(([label, count]) => <article key={label} className={mobileCard}><p className="text-[#5B6F89]">{label}</p><p className="mt-1 text-2xl font-semibold">{count}</p></article>)}
    </section>
    <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_minmax(0,.6fr)]">
      <label className="relative"><span className="sr-only">Search vehicles, owners or plates</span><Search size={17} className="pointer-events-none absolute left-3 top-3.5 text-[#5B6F89]"/><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search vehicle, owner or plate" className={`${field} w-full pl-9`}/></label>
      <select aria-label="Status" value={status} onChange={event => setStatus(event.target.value)} className={`${field} hidden lg:block`}><option value="all">All statuses</option><option value="true">Active</option><option value="false">Hidden</option></select>
      <select aria-label="Type" value={vehicleType} onChange={event => setVehicleType(event.target.value)} className={`${field} hidden lg:block`}><option value="all">All types</option><option value="car">Cars</option><option value="motorcycle">Motorcycles</option></select>
      <select aria-label="Owner" value={owner} onChange={event => setOwner(event.target.value)} className={`${field} hidden min-w-0 lg:block`}><option value="all">All owners</option>{owners.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
    </div>
    <div className="lg:hidden"><AdminFilterChips label="Vehicle filters" value={status !== "all" ? status : vehicleType} options={filters} onChange={value => {
      setOwner("all");
      setStatus(value === "true" || value === "false" ? value : "all");
      setVehicleType(value === "car" || value === "motorcycle" ? value : "all");
    }}/></div>
    {filtered.length ? <>
      <div className="space-y-3 lg:hidden">{filtered.map(car => <article key={car.id} className={mobileCard}>
        <div className="flex items-start justify-between gap-2"><VehicleIdentity car={car}/>{visibility(car)}</div>
        <p className="mt-2 text-[#5B6F89]">{car.owner?.business_name ?? "Unassigned"}</p>
        <div className="mt-2 flex flex-wrap gap-1.5"><Tag>{car.is_active ? "Active" : "Hidden"}</Tag><RentalModes car={car}/><Tag warning={car.car_photos.length < 3} success={car.car_photos.length >= 3}>{car.car_photos.length} photos</Tag>{car.car_photos.length < 3 && <Tag warning>Missing photos</Tag>}</div>
        <Rates car={car}/>
        <div className="mt-3 flex flex-wrap justify-between gap-2 border-t border-[#E3EEF9] pt-3">{view(car)}<button type="button" disabled={busyId !== null} onClick={() => toggleActive(car)} className={mobileAction}>{car.is_active ? "Deactivate" : "Reactivate"}</button></div>
      </article>)}</div>
      <div className="hidden overflow-x-auto rounded-xl border border-[#E3EEF9] bg-white lg:block">
        <table className="w-full text-left text-[13px]"><thead className="bg-[#F3F9FF] text-[#5B6F89]"><tr>{["Vehicle", "Owner", "Rental modes and rates", "Photos", "Visibility", "View"].map(label => <th className="px-3 py-3" key={label}>{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-[#E3EEF9]">{filtered.map(car => <tr key={car.id} id={`record-${car.id}`}>
            <td className="p-3"><VehicleIdentity car={car}/></td><td className="p-3">{car.owner?.business_name ?? "Unassigned"}</td>
            <td className="p-3"><div className="flex flex-wrap gap-1"><RentalModes car={car}/></div><Rates car={car}/></td>
            <td className="p-3"><Tag warning={car.car_photos.length < 3} success={car.car_photos.length >= 3}>{car.car_photos.length} photos</Tag><EntityHistory entity="car" id={car.id}/></td>
            <td className="p-3">{visibility(car)}</td><td className="p-3">{view(car)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </> : <div className={`${mobileCard} py-12 text-center`}><CarFront className="mx-auto text-[#5B6F89]"/><h2 className="mt-2 font-semibold">No vehicles match</h2><p>Try another search or filter.</p></div>}
    <p className="text-[13px] text-[#5B6F89]">Showing {filtered.length} of {cars.length}</p>
    <p className="hidden text-[13px] text-[#5B6F89] lg:block">Hiding a vehicle removes it from search. Existing bookings are kept.</p>
    <dialog ref={details} aria-labelledby="admin-vehicle-details" onClick={event => {
      if (event.target === event.currentTarget) details.current?.close();
    }} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl bg-white text-[#0F2342] backdrop:bg-[#0F2342]/45">
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-2"><h2 id="admin-vehicle-details" className="text-lg font-semibold">Vehicle details</h2><button type="button" className={mobileAction} onClick={() => details.current?.close()}>Close</button></div>
        {selected && <>
          <VehicleIdentity car={selected}/>
          <p className="text-sm">{selected.owner?.business_name ?? "Unassigned"} · {selected.is_active ? "Visible" : "Hidden"}</p>
          <div className="flex flex-wrap gap-2"><Tag>{selected.vehicle_type === "car" ? "Car" : "Motorcycle"}</Tag>{selected.year && <Tag>{selected.year}</Tag>}<RentalModes car={selected}/><Tag warning={selected.car_photos.length < 3}>{selected.car_photos.length} photos</Tag></div>
          <Rates car={selected}/>
          {selected.is_active && <Link href={`/cars/${selected.id}`} className={mobileAction}>Open public listing</Link>}
          <EntityHistory entity="car" id={selected.id}/>
        </>}
      </div>
    </dialog>
  </div>;
}

function Tag({ children, warning = false, success = false }: { children: React.ReactNode; warning?: boolean; success?: boolean }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[13px] font-medium ${warning ? "bg-[#FFF2D6] text-[#8A5A00]" : success ? "bg-[#E3F7EA] text-[#12703A]" : "bg-[#EAF4FF] text-[#0A47B1]"}`}>{children}</span>;
}

function VehicleIdentity({ car }: { car: AdminCarRow }) {
  const photo = [...car.car_photos].sort((a, b) => a.sort_order - b.sort_order)[0];
  const url = carPhotoUrl(photo?.thumb_path ?? photo?.path);
  const details = car.vehicle_type === "motorcycle" ? `${car.helmets_included} helmets` : car.transmission;
  return <div className="flex min-w-0 items-center gap-2.5">
    <span className="relative grid h-[60px] w-[72px] shrink-0 place-items-center overflow-hidden rounded-lg bg-[#EAF4FF] text-[#0A47B1] lg:h-14">
      {url ? <Image src={url} alt="" fill sizes="72px" className="object-cover" unoptimized/> : <CarFront size={22} aria-hidden/>}
    </span>
    <div className="min-w-0"><p className="break-words font-semibold">{car.brand} {car.model}</p><p className="break-words text-[13px] text-[#5B6F89]">{car.plate_number || "No plate"}{details && ` · ${details}`}</p></div>
  </div>;
}

function RentalModes({ car }: { car: AdminCarRow }) {
  return <>{car.allows_self_drive && <Tag>Self-drive</Tag>}{car.allows_with_driver && <Tag>With driver</Tag>}</>;
}

function Rates({ car }: { car: AdminCarRow }) {
  const rates = car.car_rates.filter(rate => (rate.mode === "self_drive" && car.allows_self_drive) || (rate.mode === "with_driver" && car.allows_with_driver));
  return <p className="mt-2 text-[13px] text-[#5B6F89]">{rates.length
    ? rates.map(rate => `${rate.mode === "self_drive" ? "Self-drive" : "With driver"} ${adminMoney(Number(rate.daily_rate))}/day`).join(" · ")
    : "No rental rates listed"}</p>;
}
