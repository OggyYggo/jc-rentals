"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CarSearch } from "@/lib/cars/searchParams";
import { carsUrl } from "@/lib/cars/searchParams";

export function CarListFilters({ search }: { search: CarSearch }) {
  const router = useRouter();
  const [seats, setSeats] = useState(search.seats ? String(search.seats) : "");
  const [type, setType] = useState(search.type ?? "");
  const [transmission, setTransmission] = useState(search.transmission ?? "");
  const [sort, setSort] = useState(search.sort ?? "recommended");
  const [from, setFrom] = useState(search.from ?? "");
  const [to, setTo] = useState(search.to ?? "");
  const [minPrice, setMinPrice] = useState(search.minPrice == null ? "" : String(search.minPrice));
  const [maxPrice, setMaxPrice] = useState(search.maxPrice == null ? "" : String(search.maxPrice));

  function apply() {
    router.replace(carsUrl({ ...search, from: from || undefined, to: to || undefined, seats: seats ? Number(seats) : undefined, type: type || undefined, transmission: transmission || undefined, minPrice: minPrice ? Number(minPrice) : undefined, maxPrice: maxPrice ? Number(maxPrice) : undefined, sort }), { scroll: false });
  }

  return <div className="flex flex-wrap items-end gap-3 text-xs">
    <label className="font-semibold text-[#0F2342]">Pickup date<input type="date" value={from} onChange={event => setFrom(event.target.value)} className="mt-1 block h-11 rounded-xl border border-[#D6E6F7] bg-white px-3 font-normal"/></label>
    <label className="font-semibold text-[#0F2342]">Return date<input type="date" min={from || undefined} value={to} onChange={event => setTo(event.target.value)} className="mt-1 block h-11 rounded-xl border border-[#D6E6F7] bg-white px-3 font-normal"/></label>
    <label className="font-semibold text-[#0F2342]">Car type<input value={type} onChange={event => setType(event.target.value)} placeholder="Any type" className="mt-1 block h-11 w-32 rounded-xl border border-[#D6E6F7] bg-white px-3 font-normal"/></label>
    <label className="font-semibold text-[#0F2342]">Seats<input type="number" min="1" max="20" value={seats} onChange={event => setSeats(event.target.value)} placeholder="Any" className="mt-1 block h-11 w-24 rounded-xl border border-[#D6E6F7] bg-white px-3 font-normal"/></label>
    <label className="font-semibold text-[#0F2342]">Min ₱/day<input type="number" min="0" value={minPrice} onChange={event => setMinPrice(event.target.value)} className="mt-1 block h-11 w-24 rounded-xl border border-[#D6E6F7] bg-white px-3 font-normal"/></label>
    <label className="font-semibold text-[#0F2342]">Max ₱/day<input type="number" min="0" value={maxPrice} onChange={event => setMaxPrice(event.target.value)} className="mt-1 block h-11 w-24 rounded-xl border border-[#D6E6F7] bg-white px-3 font-normal"/></label>
    <label className="font-semibold text-[#0F2342]">Transmission<select value={transmission} onChange={event => setTransmission(event.target.value)} className="mt-1 block h-11 rounded-xl border border-[#D6E6F7] bg-white px-3 font-normal"><option value="">Any</option><option>Automatic</option><option>Manual</option></select></label>
    <label className="font-semibold text-[#0F2342]">Sort by<select value={sort} onChange={event => setSort(event.target.value as NonNullable<CarSearch["sort"]>)} className="mt-1 block h-11 rounded-xl border border-[#D6E6F7] bg-white px-3 font-normal"><option value="recommended">Recommended</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option></select></label>
    <button type="button" onClick={apply} className="h-11 rounded-full bg-[#0B63CE] px-5 font-semibold text-white hover:bg-[#0A3D91] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#2E9BF0]">Apply filters</button>
  </div>;
}
