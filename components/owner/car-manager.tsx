"use client";

import { runWithAlerts } from "@/lib/alerts/run";
import { toastSuccess } from "@/lib/alerts/toast";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CarFront, Check, ChevronDown, ImagePlus, LoaderCircle, Plus, Search, ToggleLeft, ToggleRight, X, ArrowUpRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { carPhotoUrl } from "@/lib/car-photo";
import { carPhotoLimitMessage, MAX_CAR_PHOTOS } from "@/lib/cars/photo-limit";
import { UploadPaused } from "@/components/loading/UploadPaused";
import { useConnectionStatus } from "@/lib/connection/provider";
import { connectionError, fetchWithTimeout, isOffline } from "@/lib/connection/request";
import { SubmitButton } from "@/components/loading/SubmitButton";
import { makeShortCode } from "@/lib/promo/short-code";
import { FleetList, fleetStatus } from "./fleet-list";
import { Attachment, AttachmentAction, AttachmentActions, AttachmentContent, AttachmentDescription, AttachmentGroup, AttachmentMedia, AttachmentTitle } from "@/components/ui/attachment";

export type OwnerCar = {
  rating_avg?: number;
  rating_count?: number;
  id: string;
  brand: string;
  model: string;
  year: number | null;
  plate_number: string | null;
  car_type: string | null;
  vehicle_type: "car" | "motorcycle";
  engine_cc: number | null;
  helmets_included: number;
  bookings?: { count: number }[];
  transmission: string | null;
  fuel_type: string | null;
  seats: number | null;
  description: string | null;
  is_active: boolean;
  plan_hidden: boolean;
  allows_self_drive: boolean;
  allows_with_driver: boolean;
  car_rates: { id: string; mode: "self_drive" | "with_driver"; daily_rate: number; deposit_amount: number; included_hours: number | null; overtime_per_hour: number | null; notes: string | null; fuel_policy: string | null; mileage_limit: string | null; minimum_age: number | null; license_required: boolean; fuel_included: boolean; driver_meals_included: boolean; accommodation_included: boolean; coverage_area: string | null }[];
  car_photos: { id: string; path: string; thumb_path: string | null; sort_order: number; publicUrl: string }[];
};

type CarForm = {
  vehicle_type: "car" | "motorcycle"; engine_cc: string; helmets_included: string;
  brand: string; model: string; year: string; plate_number: string; car_type: string;
  transmission: string; fuel_type: string; seats: string; description: string;
  is_active: boolean; self_drive: boolean; with_driver: boolean;
  self_rate: string; deposit: string; driver_rate: string; included_hours: string; overtime: string;
  fuel_policy: string; mileage_limit: string; minimum_age: string; fuel_included: boolean;
  driver_meals_included: boolean; accommodation_included: boolean; coverage_area: string;
};

const blankForm: CarForm = { vehicle_type:"car",engine_cc:"",helmets_included:"0", brand: "", model: "", year: "", plate_number: "", car_type: "Sedan", transmission: "Automatic", fuel_type: "Gasoline", seats: "5", description: "", is_active: true, self_drive: true, with_driver: false, self_rate: "", deposit: "", driver_rate: "", included_hours: "10", overtime: "", fuel_policy: "Full-to-full", mileage_limit: "", minimum_age: "21", fuel_included: false, driver_meals_included: false, accommodation_included: false, coverage_area: "" };

function formFromCar(car: OwnerCar): CarForm {
  const self = car.car_rates.find((rate) => rate.mode === "self_drive");
  const driver = car.car_rates.find((rate) => rate.mode === "with_driver");
  return { vehicle_type:car.vehicle_type ?? "car", engine_cc:car.engine_cc?.toString() ?? "", helmets_included:String(car.helmets_included ?? 0), brand: car.brand, model: car.model, year: car.year?.toString() ?? "", plate_number: car.plate_number ?? "", car_type: car.car_type ?? "Sedan", transmission: car.transmission ?? "Automatic", fuel_type: car.fuel_type ?? "Gasoline", seats: car.seats?.toString() ?? "5", description: car.description ?? "", is_active: car.is_active, self_drive: car.allows_self_drive, with_driver: car.allows_with_driver, self_rate: self?.daily_rate?.toString() ?? "", deposit: self?.deposit_amount?.toString() ?? "", driver_rate: driver?.daily_rate?.toString() ?? "", included_hours: driver?.included_hours?.toString() ?? "10", overtime: driver?.overtime_per_hour?.toString() ?? "", fuel_policy: self?.fuel_policy ?? "Full-to-full", mileage_limit: self?.mileage_limit ?? "", minimum_age: self?.minimum_age?.toString() ?? "21", fuel_included: driver?.fuel_included ?? false, driver_meals_included: driver?.driver_meals_included ?? false, accommodation_included: driver?.accommodation_included ?? false, coverage_area: driver?.coverage_area ?? "" };
}

function PhotoPreview({ file }: { file: File }) {
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const preview = URL.createObjectURL(file);
    if (image.current) image.current.src = preview;
    return () => URL.revokeObjectURL(preview);
  }, [file]);
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={image} alt="" className="size-full rounded object-cover" />;
}

export function CarManager({ cars, ownerId, initialOpen = false, usage, hiddenByPlan = 0 }: { cars: OwnerCar[]; ownerId: string; initialOpen?: boolean; usage: {used:number;limit:number}|null; hiddenByPlan?:number }) {
  const router = useRouter();
  const offline = useConnectionStatus() === "offline";
  const formRef = useRef<HTMLFormElement>(null);
  const [pausedPhoto, setPausedPhoto] = useState(false);
  const [uncertainPhoto, setUncertainPhoto] = useState(false);
  const [editing, setEditing] = useState<OwnerCar | null>(null);
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [form, setForm] = useState<CarForm>(blankForm);
  const [photos, setPhotos] = useState<File[]>([]);
  const [savedPhotos, setSavedPhotos] = useState<OwnerCar["car_photos"]>([]);
  const [draftCarId, setDraftCarId] = useState<string>();
  const [photoNotice, setPhotoNotice] = useState("");
  const carPhotoId = editing?.id ?? draftCarId;
  const remaining = Math.max(0, MAX_CAR_PHOTOS - savedPhotos.length - photos.length);
  const [search, setSearch] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const editor = useRef<HTMLElement>(null);
  const editorTrigger = useRef<HTMLElement | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [photoBusyId, setPhotoBusyId] = useState<string>();
  const query = search.trim().toLocaleLowerCase();
  const filtered = cars.filter(car =>
    `${car.brand} ${car.model} ${car.plate_number ?? ""}`.toLocaleLowerCase().includes(query)
    && (vehicleFilter === "all" || car.vehicle_type === vehicleFilter)
    && (statusFilter === "all" || fleetStatus(car) === statusFilter),
  );
  const hasFilters = Boolean(query || vehicleFilter !== "all" || statusFilter !== "all");
  const activeCount = cars.filter(car => fleetStatus(car) === "active").length;
  const editingId = editing?.id;
  useEffect(() => {
    if (!isOpen) {
      editorTrigger.current?.focus();
      editorTrigger.current = null;
      return;
    }
    editor.current?.focus({ preventScroll: true });
    editor.current?.scrollIntoView({ block: "start" });
  }, [editingId, isOpen]);

  function openEditor(car: OwnerCar | null) {
    editorTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditing(car);
    setPausedPhoto(false); setUncertainPhoto(false);
    setForm(car ? formFromCar(car) : blankForm);
    setPhotos([]);
    setSavedPhotos([...(car?.car_photos ?? [])].sort((a, b) => a.sort_order - b.sort_order));
    setDraftCarId(undefined);
    setPhotoNotice("");
    setError("");
    setIsOpen(true);
  }

  function openNewCar() { openEditor(null); }
  function update<K extends keyof CarForm>(key: K, value: CarForm[K]) { setForm((current) => ({ ...current, [key]: value })); }

  async function saveCar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || isOffline() || uncertainPhoto) return;
    setPausedPhoto(false);
    setError("");
    if (photos.length && savedPhotos.length + photos.length > MAX_CAR_PHOTOS) return setError(carPhotoLimitMessage);
    if (form.vehicle_type === "motorcycle") { if (Number(form.seats) < 1 || Number(form.seats) > 2) { setError("Motorcycles can have 1 or 2 passengers."); return; } if (!["Gasoline", "Electric"].includes(form.fuel_type)) { setError("Motorcycles must use gasoline or electric fuel."); return; } if (form.engine_cc && (Number(form.engine_cc) < 50 || Number(form.engine_cc) > 2000)) { setError("Engine size must be between 50 and 2,000 cc."); return; } }
    if (!form.self_drive && !form.with_driver) { setError("Select at least one rental mode."); return; }
    if ((form.self_drive && Number(form.self_rate) < 1) || (form.with_driver && Number(form.driver_rate) < 1)) { setError("Enter a daily rate for each enabled rental mode."); return; }
    if (photos.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024)) { setError("Photos must be JPG, PNG, or WebP files under 10 MB each."); return; }

    const visibilityChanged = editing ? editing.is_active !== form.is_active : form.is_active;
    const result = await runWithAlerts({
      connection: { statusHref: "/owner/cars" },
      confirm: visibilityChanged ? {
        title: form.is_active ? "Publish this vehicle?" : "Hide this vehicle?",
        text: form.is_active ? "Customers can find it in search once it is eligible." : "It will disappear from customer search.",
        confirmText: form.is_active ? "Publish vehicle" : "Hide vehicle",
      } : undefined,
      setPending: setBusy,
      refresh: router.refresh,
      run: async () => {
        const supabase = createClient();
        const carValues = { owner_id: ownerId, vehicle_type:form.vehicle_type, engine_cc:form.vehicle_type === "motorcycle" && form.engine_cc ? Number(form.engine_cc) : null, helmets_included:form.vehicle_type === "motorcycle" ? Number(form.helmets_included) : 0, brand: form.brand.trim(), model: form.model.trim(), year: form.year ? Number(form.year) : null, plate_number: form.plate_number.trim() || null, car_type: form.car_type, transmission: form.transmission, fuel_type: form.fuel_type, seats: Number(form.seats), description: form.description.trim() || null, is_active: form.is_active, allows_self_drive: form.self_drive, allows_with_driver: form.vehicle_type === "motorcycle" ? false : form.with_driver };
        let carId = carPhotoId;
        if (carId) {
          const { error: updateError } = await supabase.from("cars").update(carValues).eq("id", carId);
          if (updateError) throw updateError;
        } else {
          let created = false;
          for (let attempt = 0; attempt < 4 && !created; attempt++) {
            const { data, error: insertError } = await supabase.from("cars").insert({ ...carValues, short_code: makeShortCode() }).select("id").single();
            if (!insertError) { carId = data.id; setDraftCarId(data.id); created = true; }
            else if (insertError.code !== "23505") throw insertError;
          }
          if (!created) throw new Error("Could not reserve a public promo link. Please try again.");
        }
        if (!carId) throw new Error("Could not save the vehicle record.");

        const rates: Array<Record<string, unknown>> = [];
        if (form.self_drive) rates.push({ car_id: carId, mode: "self_drive", daily_rate: Number(form.self_rate), deposit_amount: Number(form.deposit || 0), fuel_policy: form.fuel_policy.trim() || null, mileage_limit: form.mileage_limit.trim() || null, minimum_age: form.minimum_age ? Number(form.minimum_age) : null, license_required: true });
        if (form.with_driver && form.vehicle_type !== "motorcycle") rates.push({ car_id: carId, mode: "with_driver", daily_rate: Number(form.driver_rate), included_hours: Number(form.included_hours || 10), overtime_per_hour: Number(form.overtime || 0), fuel_included: form.fuel_included, driver_meals_included: form.driver_meals_included, accommodation_included: form.accommodation_included, coverage_area: form.coverage_area.trim() || null, license_required: false });
        if (rates.length) {
          const { error: rateError } = await supabase.from("car_rates").upsert(rates, { onConflict: "car_id,mode" });
          if (rateError) throw rateError;
        }

        for (const [index, file] of photos.entries()) {
          const uploadForm = new FormData();
          uploadForm.append("carId", carId);
          uploadForm.append("file", file, file.name);
          let response: Response;
          let result;
          try {
            response = await fetchWithTimeout("/api/owner/car-photos", { method: "POST", body: uploadForm });
            result = await response.json();
          } catch (error) {
            const issue = connectionError(error);
            if (issue && !issue.sent) { setPausedPhoto(true); return false; }
            setUncertainPhoto(true);
            setError("Check your saved photos before uploading this file again.");
            throw error;
          }
          if (!response?.ok || !result?.id) {
            const reason = result?.code === "CAR_PHOTO_LIMIT" ? carPhotoLimitMessage : "Try uploading this photo again.";
            setError(`Vehicle details saved. Saved ${index} of ${photos.length} new photos. Could not upload ${file.name}. ${reason}`);
            return false;
          }
          const saved = { id: result.id, path: result.path, thumb_path: result.thumbPath, sort_order: result.sortOrder, publicUrl: carPhotoUrl(result.thumbPath) ?? "" };
          setSavedPhotos(current => [...current, saved].sort((a, b) => a.sort_order - b.sort_order));
          setPhotos(current => current.filter(item => item !== file));
        }

        setIsOpen(false); setPhotoNotice(""); setPhotos([]);
        return true;
      },
    });
    if (result.ok && result.data) await toastSuccess("Vehicle saved");
  }

  function toggleActive(car: OwnerCar) {
    return runWithAlerts({
      confirm: {
        title: car.is_active ? "Hide this vehicle?" : "Publish this vehicle?",
        text: car.is_active ? `${car.brand} ${car.model} will disappear from customer search.` : `${car.brand} ${car.model} can appear in customer search once eligible.`,
        confirmText: car.is_active ? "Hide vehicle" : "Publish vehicle",
      },
      setPending: setBusy,
      run: async () => {
        const { error } = await createClient().from("cars").update({ is_active: !car.is_active }).eq("id", car.id);
        if (error) throw error;
      },
      success: car.is_active ? "Vehicle hidden" : "Vehicle published",
      refresh: router.refresh,
    });
  }

  function removePhoto(photo: OwnerCar["car_photos"][number]) {
    if (!carPhotoId) return;
    return runWithAlerts({
      confirm: { title: "Remove this photo?", confirmText: "Remove photo", danger: true },
      setPending: pending => {
        setBusy(pending);
        setPhotoBusyId(pending ? photo.id : undefined);
      },
      run: async () => {
        const db = createClient();
        const { error: rowError } = await db.from("car_photos").delete().eq("id", photo.id);
        if (rowError) throw rowError;
        setSavedPhotos(current => current.filter(item => item.id !== photo.id));
        setPhotoNotice("");
        const paths = [photo.path, photo.thumb_path].filter((path): path is string => !!path);
        const { error: fileError } = await db.storage.from("car-photos").remove(paths);
        if (fileError) { router.refresh(); throw fileError; }
      },
      success: "Photo removed",
      refresh: router.refresh,
    });
  }

  function setCover(photo: OwnerCar["car_photos"][number]) {
    if (!carPhotoId || savedPhotos[0]?.id === photo.id) return;
    return runWithAlerts({
      setPending: pending => {
        setBusy(pending);
        setPhotoBusyId(pending ? photo.id : undefined);
      },
      run: async () => {
        const sortOrder = savedPhotos[0].sort_order - 1;
        const { error } = await createClient().from("car_photos").update({ sort_order: sortOrder })
          .eq("id", photo.id).eq("car_id", carPhotoId).select("id").single();
        if (error) throw error;
        setSavedPhotos(current => [{ ...photo, sort_order: sortOrder }, ...current.filter(item => item.id !== photo.id)]);
      },
      success: "Cover photo updated",
      refresh: router.refresh,
    });
  }

  return <div className="space-y-4">
    <section aria-label="Fleet summary" className="grid gap-3 lg:grid-cols-[1fr_1fr_1.4fr]">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-[#dce5f1] bg-white px-3.5 py-3 lg:col-span-2 lg:grid lg:grid-cols-2 lg:px-5 lg:py-4">
        <div><p className="text-xs font-medium text-[#52647d]">Total vehicles</p><p className="mt-0.5 text-xl font-semibold tabular-nums text-[#20334e]">{cars.length}</p></div>
        <div className="border-l border-[#e8eef6] pl-4"><p className="text-xs font-medium text-[#52647d]">Active listings</p><p className="mt-0.5 text-xl font-semibold tabular-nums text-[#20334e]">{activeCount}</p></div>
        <button type="button" onClick={openNewCar} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg bg-[#2457d6] px-2.5 text-xs font-semibold text-white hover:bg-[#1d4ed8] lg:hidden"><Plus size={15} aria-hidden="true" />Add vehicle</button>
      </div>
      <div className="rounded-xl border border-[#dce5f1] bg-[#edf4ff] px-3.5 py-2 lg:px-4 lg:py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3">
          <p className="text-xs font-medium text-[#405775]">Plan usage {usage && <strong className="ml-1 text-[#203b65]">{usage.used} of {usage.limit} active slots</strong>}</p>
          <a href="/owner/plan" className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-[#204a8b] hover:underline lg:min-h-8">Manage plan <ArrowUpRight size={13} aria-hidden="true" /></a>
        </div>
        {usage && usage.limit > 0 && <progress className="hidden h-1.5 w-full accent-[#2457d6] lg:block" max={usage.limit} value={usage.used} aria-label="Active vehicle slots used" />}
        {hiddenByPlan > 0 && <p className="text-xs font-medium text-amber-900 lg:mt-1">{hiddenByPlan} hidden by plan</p>}
      </div>
    </section>

    <div className={`rounded-xl border border-[#dce5f1] bg-white p-3 ${isOpen ? "hidden lg:block" : ""}`}>
      <div className="grid grid-cols-2 gap-2 lg:flex lg:flex-wrap lg:items-center">
        <label className="relative col-span-2 min-w-0 lg:flex-1">
          <span className="sr-only">Search vehicles</span>
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#52647d]" />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search make, model, or plate" className="min-h-11 w-full rounded-lg border border-[#dce5f1] bg-[#f8fbff] pl-9 pr-3 text-sm text-[#20334e] placeholder:text-[#626f82] focus-visible:outline-2 focus-visible:outline-[#2457d6]" />
        </label>
        <FleetFilter label="Vehicle type" value={vehicleFilter} onChange={setVehicleFilter}>
          <option value="all">All types</option><option value="car">Cars</option><option value="motorcycle">Motorcycles</option>
        </FleetFilter>
        <FleetFilter label="Listing status" value={statusFilter} onChange={setStatusFilter}>
          <option value="all">All statuses</option><option value="active">Active</option><option value="hidden">Hidden</option><option value="plan">Hidden by plan</option>
        </FleetFilter>
        <button type="button" onClick={openNewCar} className="hidden min-h-11 items-center gap-2 rounded-lg bg-[#2457d6] px-3.5 text-sm font-semibold text-white hover:bg-[#1d4ed8] lg:inline-flex"><Plus size={15} aria-hidden="true" />Add vehicle</button>
      </div>
      {hasFilters && <div className="mt-2 flex items-center justify-between gap-3">
        <p role="status" className="text-xs text-[#52647d]">{filtered.length} of {cars.length} vehicles</p>
        <button type="button" className="min-h-9 text-xs font-semibold text-[#204a8b] underline underline-offset-2" onClick={() => { setSearch(""); setVehicleFilter("all"); setStatusFilter("all"); }}>Clear filters</button>
      </div>}
    </div>
    {error && !isOpen && <p role="alert" className="rounded-lg border border-[#f1cccc] bg-[#fff6f6] px-3 py-2 text-xs text-[#a13a3a]">{error}</p>}
    {isOpen && <section ref={editor} tabIndex={-1} aria-labelledby="vehicle-editor-heading" className="scroll-mt-24 rounded-xl border border-[#e2e8f0] bg-white p-4 shadow-sm sm:p-6"><div className="mb-5 flex items-start justify-between"><div><h2 id="vehicle-editor-heading" className="text-base font-semibold text-[#33445b]">{editing ? `Edit ${editing.brand} ${editing.model}` : "Add a vehicle"}</h2><p className="mt-1 text-[10px] text-[#8793a3]">Set up the vehicle details, rental options, and photos.</p></div><button type="button" aria-label="Close form" disabled={busy} onClick={() => setIsOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8591a2] hover:bg-[#f4f6fa]"><X size={17}/></button></div>
      <form ref={formRef} onSubmit={saveCar} className="space-y-5"><div className="mb-4 flex w-fit rounded-full bg-[#eef4ff] p-1">{(["car","motorcycle"] as const).map(type=><button key={type} type="button" disabled={Boolean(editing && editing.vehicle_type !== type && (editing.bookings?.[0]?.count ?? 0) > 0)} onClick={()=>{update("vehicle_type",type);if(type==="motorcycle"){update("with_driver",false);update("self_drive",true);update("seats",form.seats==="5"?"2":form.seats);update("car_type","Scooter");update("fuel_type","Gasoline");}else{update("car_type","Sedan");update("helmets_included","0");}}} className={`rounded-full px-4 py-2 text-xs font-semibold capitalize ${form.vehicle_type===type?"bg-[#2457d6] text-white":"text-[#41536c]"}`}>{type}</button>)}</div>{editing && (editing.bookings?.[0]?.count ?? 0) > 0 && <p className="mb-3 text-[10px] text-[#8793a3]">Vehicle type cannot be changed after bookings exist.</p>}<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Make / brand"><input required value={form.brand} onChange={(event) => update("brand", event.target.value)} placeholder={form.vehicle_type === "motorcycle" ? "Honda" : "Toyota"} className={inputClass}/></Field><Field label="Model"><input required value={form.model} onChange={(event) => update("model", event.target.value)} placeholder={form.vehicle_type === "motorcycle" ? "Click 125" : "Vios"} className={inputClass}/></Field><Field label="Year"><input type="number" min="1990" max="2100" value={form.year} onChange={(event) => update("year", event.target.value)} placeholder="2024" className={inputClass}/></Field><Field label="Plate number"><input value={form.plate_number} onChange={(event) => update("plate_number", event.target.value)} placeholder="ABC 1234" className={inputClass}/></Field>
        <Field label="Vehicle type"><select value={form.car_type} onChange={(event) => update("car_type", event.target.value)} className={inputClass}>{(form.vehicle_type === "motorcycle" ? ["Scooter", "Standard", "Adventure", "Big bike"] : ["Sedan", "SUV", "MPV", "Van", "Pickup", "Coupe", "Other"]).map((type) => <option key={type}>{type}</option>)}</select></Field><Field label="Transmission"><select value={form.transmission} onChange={(event) => update("transmission", event.target.value)} className={inputClass}>{(form.vehicle_type === "motorcycle" ? ["Automatic", "Manual", "Semi-automatic"] : ["Automatic", "Manual"]).map((value) => <option key={value}>{value}</option>)}</select></Field><Field label="Fuel type"><select value={form.fuel_type} onChange={(event) => update("fuel_type", event.target.value)} className={inputClass}>{(form.vehicle_type === "motorcycle" ? ["Gasoline", "Electric"] : ["Gasoline", "Diesel", "Hybrid", "Electric"]).map((value)=><option key={value}>{value}</option>)}</select></Field><Field label={form.vehicle_type === "motorcycle" ? "Passengers" : "Seats"}><input type="number" min="1" max={form.vehicle_type === "motorcycle" ? 2 : 30} value={form.seats} onChange={(event) => update("seats", event.target.value)} className={inputClass}/></Field>
        {form.vehicle_type === "motorcycle" && <><Field label="Engine size (cc)"><input type="number" min="50" max="2000" value={form.engine_cc} onChange={(event)=>update("engine_cc",event.target.value)} className={inputClass}/></Field><Field label="Helmets included"><select value={form.helmets_included} onChange={(event)=>update("helmets_included",event.target.value)} className={inputClass}><option value="0">0</option><option value="1">1</option><option value="2">2</option></select></Field></>}
      </div>
      <Field label="Description"><textarea value={form.description} onChange={(event) => update("description", event.target.value)} rows={2} placeholder="A few details customers should know..." className="w-full resize-y rounded-lg border border-[#dfe5ec] px-3 py-2 text-xs outline-none focus:border-[#94a9e9]"/></Field>
      <div><h3 className="mb-2 text-xs font-semibold text-[#45556c]">Rental modes and pricing</h3><div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-[#e5eaf1] p-3.5"><Toggle checked={form.self_drive} onChange={(value) => update("self_drive", value)} label="Self drive"/><div className={`mt-3 grid grid-cols-2 gap-3 ${form.self_drive ? "" : "opacity-50"}`}><Field label="Daily rate (₱)"><input type="number" min="0" disabled={!form.self_drive} value={form.self_rate} onChange={(event) => update("self_rate", event.target.value)} className={inputClass}/></Field><Field label="Refundable security deposit (₱)"><input type="number" min="0" disabled={!form.self_drive} value={form.deposit} onChange={(event) => update("deposit", event.target.value)} className={inputClass}/></Field><Field label="Fuel policy"><input disabled={!form.self_drive} value={form.fuel_policy} onChange={(event) => update("fuel_policy", event.target.value)} placeholder="Full-to-full" className={inputClass}/></Field><Field label="Mileage limit"><input disabled={!form.self_drive} value={form.mileage_limit} onChange={(event) => update("mileage_limit", event.target.value)} placeholder="e.g. 200 km/day" className={inputClass}/></Field><Field label="Minimum driver age"><input type="number" min="18" disabled={!form.self_drive} value={form.minimum_age} onChange={(event) => update("minimum_age", event.target.value)} className={inputClass}/></Field><p className="flex items-center gap-2 text-[10px] text-[#69788e]"><input type="checkbox" checked disabled className="accent-[#2457d6]"/>Valid license required</p></div></div>
        <div className={`rounded-xl border border-[#e5eaf1] p-3.5 ${form.vehicle_type === "motorcycle" ? "hidden" : ""}`}><Toggle checked={form.with_driver} onChange={(value) => update("with_driver", value)} label="With driver"/><div className={`mt-3 grid grid-cols-2 gap-2 ${form.with_driver ? "" : "opacity-50"}`}><Field label="Daily rate (₱)"><input type="number" min="0" disabled={!form.with_driver} value={form.driver_rate} onChange={(event) => update("driver_rate", event.target.value)} className={inputClass}/></Field><Field label="Hours included"><input type="number" min="1" disabled={!form.with_driver} value={form.included_hours} onChange={(event) => update("included_hours", event.target.value)} className={inputClass}/></Field><Field label="Overtime / hr (₱)"><input type="number" min="0" disabled={!form.with_driver} value={form.overtime} onChange={(event) => update("overtime", event.target.value)} className={inputClass}/></Field><Field label="Coverage area"><input disabled={!form.with_driver} value={form.coverage_area} onChange={(event) => update("coverage_area", event.target.value)} placeholder="e.g. Bohol Island" className={inputClass}/></Field>{[["fuel_included", "Fuel included"], ["driver_meals_included", "Driver meals included"], ["accommodation_included", "Accommodation included"]].map(([key, label]) => <label key={key} className="flex items-center gap-2 text-[10px] text-[#69788e]"><input type="checkbox" disabled={!form.with_driver} checked={form[key as "fuel_included" | "driver_meals_included" | "accommodation_included"]} onChange={(event) => update(key as "fuel_included" | "driver_meals_included" | "accommodation_included", event.target.checked)} className="accent-[#2457d6]"/>{label}</label>)}</div><p className="mt-2 text-[9px] text-[#8995a6]">No driver license is needed for this rental mode.</p></div>
      </div></div>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end"><Field label="Vehicle photos">
        <p className="mb-2 text-xs font-semibold">Photos: {savedPhotos.length + photos.length} of {MAX_CAR_PHOTOS} used</p>
        {savedPhotos.length > MAX_CAR_PHOTOS && <p className="mb-2 text-xs text-amber-800">This vehicle already has more than 3 photos. Remove some to add new ones.</p>}
        <label className={`flex min-h-12 items-center gap-3 rounded-xl border border-dashed border-[#cbd7e8] bg-[#f8faff] px-4 text-xs text-[#526178] ${remaining && !busy ? "cursor-pointer hover:border-[#91a9dc]" : "opacity-60"}`}>
          <ImagePlus size={16} aria-hidden="true" />
          <span><span className="block font-semibold text-[#405879]">Choose vehicle photos</span><span className="mt-0.5 block text-[10px] text-[#596b83]">Up to 3 photos, JPG, PNG or WebP, 10 MB each. The first photo is the cover.</span></span>
          <input type="file" multiple disabled={busy || !remaining} accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={event => {
            const selected = Array.from(event.target.files ?? []);
            if (selected.length) {
              setPhotos(current => [...current, ...selected.slice(0, remaining)]);
              setPhotoNotice(selected.length > remaining ? `Only 3 photos are allowed. We kept the first ${remaining}.` : "");
            }
            event.target.value = "";
          }} />
        </label>
        {photoNotice && <p role="status" className="mt-2 text-xs text-amber-800">{photoNotice}</p>}
        {photos.length > 0 && <AttachmentGroup className="mt-2 flex-wrap overflow-visible">
          {photos.map((file, index) => <Attachment key={`${file.name}-${file.lastModified}-${index}`} size="sm" className="w-full max-w-none border-[#e3e9f2] bg-white sm:w-[calc(50%-0.375rem)]">
            <AttachmentMedia className="bg-[#edf3ff] text-[#466cc4]"><PhotoPreview file={file} /></AttachmentMedia>
            <AttachmentContent><AttachmentTitle>{file.name}</AttachmentTitle><AttachmentDescription>{!savedPhotos.length && index === 0 ? "Cover photo" : "Ready to upload"}</AttachmentDescription></AttachmentContent>
            <AttachmentActions>
              {!savedPhotos.length && index > 0 && <AttachmentAction type="button" disabled={busy} aria-label={`Make ${file.name} the cover`} title="Make cover" onClick={() => setPhotos(current => [file, ...current.filter((_, i) => i !== index)])}><Check /></AttachmentAction>}
              <AttachmentAction type="button" disabled={busy} aria-label={`Remove ${file.name}`} title="Remove photo" onClick={() => {
                setPhotos(current => current.filter((_, i) => i !== index));
                setPhotoNotice("");
              }}><X /></AttachmentAction>
            </AttachmentActions>
          </Attachment>)}
        </AttachmentGroup>}
        {savedPhotos.length > 0 && <div className="mt-3">
          <p className="mb-2 text-[10px] font-medium text-[#596b83]">Uploaded photos</p>
          <div className="flex flex-wrap gap-2">
            {savedPhotos.map((photo, index) => <div key={photo.id} className="w-16">
              <div className="relative h-14 overflow-hidden rounded-md border border-[#e5eaf1]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.publicUrl} alt={`Vehicle photo ${index + 1}`} className="h-full w-full object-cover" />
                <button type="button" disabled={busy} onClick={() => removePhoto(photo)} aria-label={`Remove vehicle photo ${index + 1}`} className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded bg-[#19283c]/70 text-white">{photoBusyId === photo.id ? <LoaderCircle size={11} className="animate-spin" /> : <X size={11} />}</button>
              </div>
              {index === 0 ? <p className="text-[10px] font-semibold text-[#405879]">Cover</p>
                : <SubmitButton unstyled type="button" busy={photoBusyId === photo.id} disabled={busy} onClick={() => setCover(photo)} className="text-[10px] font-semibold text-[#2457d6] underline">Make cover</SubmitButton>}
            </div>)}
          </div>
        </div>}
        </Field><label className="flex items-center gap-2 pb-2 text-xs text-[#526178]"><input type="checkbox" checked={form.is_active} onChange={(event) => update("is_active", event.target.checked)} className="accent-[#2457d6]"/>Show vehicle as active</label></div>
      {photos.length > 0 && (offline || pausedPhoto) && !uncertainPhoto && <UploadPaused
        fileName={photos[0].name} description="Your vehicle details and selected photos are kept while you retry."
        busy={busy} onRetry={() => formRef.current?.requestSubmit()} onCancel={() => { setPausedPhoto(false); setPhotos([]); }} />}
      {error && <p role="alert" className="rounded-lg border border-[#f1cccc] bg-[#fff6f6] px-3 py-2 text-xs text-[#a13a3a]">{error}</p>}<div className="flex justify-end gap-2 border-t border-[#edf0f4] pt-4"><button type="button" disabled={busy} onClick={() => setIsOpen(false)} className="h-9 rounded-lg border border-[#e1e7ef] px-3 text-xs font-medium text-[#68778c]">Cancel</button><button disabled={busy || offline || uncertainPhoto || pausedPhoto} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#2457d6] px-4 text-xs font-semibold text-white disabled:opacity-60">{busy && <LoaderCircle size={14} className="motion-safe:animate-spin"/>}{offline ? "Needs internet to continue" : carPhotoId ? "Save changes" : "Add vehicle"}</button></div></form>
      </section>}

    <div className={isOpen ? "hidden lg:block" : undefined}>
      {filtered.length ? <FleetList cars={filtered} busy={busy} onEdit={openEditor} onToggle={toggleActive} />
        : <div className="rounded-xl border border-[#dce5f1] bg-white px-5 py-8 text-center lg:py-14">
          <span className="mx-auto grid size-11 place-items-center rounded-xl bg-[#edf4ff] text-[#315fae]"><CarFront size={20} aria-hidden="true" /></span>
          <h2 className="mt-3 text-sm font-semibold text-[#20334e]">{hasFilters ? "No matching vehicles" : "No vehicles yet"}</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-[#52647d]">{hasFilters ? "Try another search or change your filters." : "Add a car or motorcycle to start setting rental rates and uploading photos."}</p>
        </div>}
    </div>
  </div>;
}

function FleetFilter({ label, value, onChange, children }: {
  label: string; value: string; onChange: (value: string) => void; children: ReactNode;
}) {
  return <div className="relative min-w-0">
    <select aria-label={label} value={value} onChange={event => onChange(event.target.value)}
      className="min-h-11 w-full appearance-none rounded-lg border border-[#dce5f1] bg-white pl-2.5 pr-8 text-xs text-[#405775] focus-visible:outline-2 focus-visible:outline-[#2457d6] sm:text-sm forced-colors:appearance-auto forced-colors:pr-2">
      {children}
    </select>
    <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#52647d] forced-colors:hidden" />
  </div>;
}

const inputClass = "h-9 w-full rounded-lg border border-[#dfe5ec] bg-white px-2.5 text-xs text-[#43536a] outline-none focus:border-[#94a9e9] focus:ring-3 focus:ring-[#2457d6]/10";
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block text-[10px] font-medium text-[#69788e]">{label}<div className="mt-1.5">{children}</div></label>; }
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) { return <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-2 text-xs font-semibold text-[#46566d]">{checked ? <ToggleRight size={20} className="text-[#3166d5]"/> : <ToggleLeft size={20} className="text-[#9ba6b5]"/>}{label}{checked && <Check size={12} className="text-[#3e8b67]"/>}</button>; }
