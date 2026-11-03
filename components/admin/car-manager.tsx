"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CarFront, LoaderCircle, Search } from "lucide-react";
import { AdminStatus, peso } from "@/components/admin/ui";
import { createClient } from "@/lib/supabase/client";

export type AdminCarRow = { id: string; brand: string; model: string; year: number | null; plate_number: string | null; car_type: string | null; transmission: string | null; is_active: boolean; allows_self_drive: boolean; allows_with_driver: boolean; owner: { business_name: string } | null; car_rates: { mode: string; daily_rate: number }[]; car_photos: { id: string }[] };

export function CarManager({ cars }: { cars: AdminCarRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const filtered = useMemo(() => cars.filter((car) => `${car.brand} ${car.model} ${car.owner?.business_name ?? ""} ${car.plate_number ?? ""}`.toLowerCase().includes(search.toLowerCase()) && (status === "all" || String(car.is_active) === status)), [cars, search, status]);

  async function toggleActive(car: AdminCarRow) {
    setBusyId(car.id); setError("");
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.from("cars").update({ is_active: !car.is_active }).eq("id", car.id);
      if (updateError) throw updateError;
      router.refresh();
    } catch (updateError) { setError(updateError instanceof Error ? updateError.message : "Could not update this vehicle."); }
    finally { setBusyId(null); }
  }

  return <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="relative w-full max-w-xs"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b97a8]"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search cars, owners, plates..." className="h-9 w-full rounded-lg border border-[#dfe5ec] bg-white pl-9 pr-3 text-xs outline-none focus:border-[#94a9e9]"/></div><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-lg border border-[#dfe5ec] bg-white px-3 text-[10px] text-[#56657b]"><option value="all">All vehicles</option><option value="true">Active</option><option value="false">Hidden</option></select></div>
    {error && <p role="alert" className="rounded-lg border border-[#f1cccc] bg-[#fff6f6] px-3 py-2 text-xs text-[#a13a3a]">{error}</p>}
    {filtered.length ? <div className="overflow-x-auto rounded-xl border border-[#e7ecf3] bg-white shadow-[0_2px_6px_rgba(20,42,78,.025)]"><table className="w-full min-w-[900px] text-left"><thead className="bg-[#f9fafc] text-[9px] font-medium uppercase tracking-wide text-[#8d99aa]"><tr><th className="px-4 py-3">Vehicle</th><th className="px-3 py-3">Owner</th><th className="px-3 py-3">Rental modes / rates</th><th className="px-3 py-3">Photos</th><th className="px-3 py-3">Visibility</th><th className="px-3 py-3">Action</th></tr></thead><tbody className="divide-y divide-[#f0f2f6]">{filtered.map((car) => <tr key={car.id} className="text-[10px] text-[#68778c]"><td className="px-4 py-3.5"><div className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#edf2ff] text-[#4c6fc9]"><CarFront size={16}/></span><div><p className="font-semibold text-[#43536a]">{car.year ? `${car.year} ` : ""}{car.brand} {car.model}</p><p className="mt-0.5 text-[9px] text-[#8b97a8]">{car.plate_number || "No plate"} · {car.car_type || car.transmission || "Vehicle"}</p></div></div></td><td className="px-3 py-3.5 text-[#53637a]">{car.owner?.business_name || "Unassigned"}</td><td className="px-3 py-3.5"><div className="space-y-1">{car.allows_self_drive && <p>Self drive · {peso(Number(car.car_rates.find((rate) => rate.mode === "self_drive")?.daily_rate))}/day</p>}{car.allows_with_driver && <p>With driver · {peso(Number(car.car_rates.find((rate) => rate.mode === "with_driver")?.daily_rate))}/day</p>}{!car.allows_self_drive && !car.allows_with_driver && <p>No rental mode enabled</p>}</div></td><td className="px-3 py-3.5">{car.car_photos?.length ?? 0}</td><td className="px-3 py-3.5"><AdminStatus status={car.is_active ? "active" : "inactive"}/></td><td className="px-3 py-3.5"><button disabled={busyId === car.id} onClick={() => toggleActive(car)} className={`inline-flex h-8 min-w-20 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-semibold ${car.is_active ? "border-[#f0dddd] text-[#a14d4d] hover:bg-[#fff6f6]" : "border-[#dbe4fb] text-[#4568bd] hover:bg-[#f7f9ff]"}`}>{busyId === car.id && <LoaderCircle size={12} className="animate-spin"/>}{car.is_active ? "Hide car" : "Activate"}</button></td></tr>)}</tbody></table></div> : <div className="rounded-xl border border-[#e7ecf3] bg-white px-6 py-14 text-center"><CarFront className="mx-auto text-[#94a1b2]" size={22}/><h2 className="mt-3 text-sm font-semibold text-[#43536a]">No cars match</h2><p className="mt-1 text-xs text-[#8793a3]">Try another search or filter.</p></div>}
  </div>;
}
