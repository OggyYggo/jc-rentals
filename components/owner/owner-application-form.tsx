"use client";

import { useState } from "react";
import type { FormEvent } from "react";

const inputClass = "mt-1 block w-full rounded-lg border border-[#dfe5ec] bg-white px-3 py-2.5 text-sm text-[#26364e] outline-none focus:border-[#7f9be0]";

export function OwnerApplicationForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const carYear = String(form.get("car_year") ?? "").trim();

    try {
      const response = await fetch("/api/owner-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: String(form.get("full_name") ?? "").trim(),
          business_name: String(form.get("business_name") ?? "").trim(),
          email: String(form.get("email") ?? "").trim(),
          phone: String(form.get("phone") ?? "").trim(),
          car_make: String(form.get("car_make") ?? "").trim(),
          car_model: String(form.get("car_model") ?? "").trim(),
          car_year: carYear ? Number(carYear) : null,
          message: String(form.get("message") ?? "").trim(),
          address: String(form.get("address") ?? "").trim(),
          plate_number: String(form.get("plate_number") ?? "").trim().toUpperCase(),
          seats: String(form.get("seats") ?? ""),
          transmission: String(form.get("transmission") ?? ""),
          fuel_type: String(form.get("fuel_type") ?? "").trim(),
          offers_self_drive: form.get("offers_self_drive") === "on",
          offers_with_driver: form.get("offers_with_driver") === "on",
          daily_rate_self_drive: String(form.get("daily_rate_self_drive") ?? ""),
          daily_rate_with_driver: String(form.get("daily_rate_with_driver") ?? ""),
          pickup_location: String(form.get("pickup_location") ?? "").trim(),
          accepted_terms: form.get("accepted_terms") === "on",
          website: String(form.get("website") ?? ""),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not submit your application. Please try again.");
      setSubmitted(true);
      formElement.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit your application. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-5 text-sm leading-6 text-green-900">
      <h2 className="font-semibold">Application received</h2>
      <p className="mt-1">Thank you. We received your application. Our team will review it and contact you soon.</p>
    </div>;
  }

  return <form onSubmit={submit} className="space-y-4 rounded-2xl border border-[#e3e8ef] bg-white p-5 shadow-sm sm:p-7">
    <div aria-hidden="true" className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
      <label>Leave this field blank<input name="website" tabIndex={-1} autoComplete="off"/></label>
    </div>
    <h2 className="text-sm font-semibold text-[#33445b]">About you</h2><div className="grid gap-4 sm:grid-cols-2">
      <label className="text-xs font-medium text-[#53637a]">Your name<input name="full_name" required minLength={2} maxLength={120} autoComplete="name" className={inputClass}/></label>
      <label className="text-xs font-medium text-[#53637a]">Business name<input name="business_name" required minLength={2} maxLength={120} autoComplete="organization" className={inputClass}/></label>
      <label className="text-xs font-medium text-[#53637a]">Email<input name="email" type="email" required maxLength={254} autoComplete="email" className={inputClass}/></label>
      <label className="text-xs font-medium text-[#53637a]">Phone<input name="phone" type="tel" required minLength={7} maxLength={30} autoComplete="tel" className={inputClass}/></label>
      <label className="text-xs font-medium text-[#53637a] sm:col-span-2">Address (optional)<input name="address" autoComplete="street-address" className={inputClass}/></label>
    </div><h2 className="pt-2 text-sm font-semibold text-[#33445b]">Your car</h2><div className="grid gap-4 sm:grid-cols-2">
      <label className="text-xs font-medium text-[#53637a]">Car make<input name="car_make" required minLength={2} maxLength={80} placeholder="Toyota" className={inputClass}/></label>
      <label className="text-xs font-medium text-[#53637a]">Car model<input name="car_model" required maxLength={80} placeholder="Vios" className={inputClass}/></label>
      <label className="text-xs font-medium text-[#53637a]">Car year (optional)<input name="car_year" type="number" min="1900" max="2100" className={inputClass}/></label>
      <label className="text-xs font-medium text-[#53637a]">Plate number<input name="plate_number" required minLength={3} maxLength={20} className={inputClass}/></label>
      <label className="text-xs font-medium text-[#53637a]">Seats<input name="seats" type="number" min="1" max="50" className={inputClass}/></label>
      <label className="text-xs font-medium text-[#53637a]">Transmission<select name="transmission" className={inputClass}><option value="">Select</option><option value="manual">Manual</option><option value="automatic">Automatic</option></select></label>
      <label className="text-xs font-medium text-[#53637a]">Fuel type<input name="fuel_type" maxLength={40} placeholder="Gasoline, diesel, hybrid…" className={inputClass}/></label>
    </div><h2 className="pt-2 text-sm font-semibold text-[#33445b]">How you rent it</h2><div className="grid gap-4 sm:grid-cols-2">
      <label className="flex items-center gap-2 text-sm text-[#53637a]"><input type="checkbox" name="offers_self_drive" defaultChecked/>Self-drive</label><label className="flex items-center gap-2 text-sm text-[#53637a]"><input type="checkbox" name="offers_with_driver"/>With driver</label>
      <label className="text-xs font-medium text-[#53637a]">Self-drive rate per day<input name="daily_rate_self_drive" type="number" min="1" step="0.01" className={inputClass}/></label><label className="text-xs font-medium text-[#53637a]">With-driver rate per day<input name="daily_rate_with_driver" type="number" min="1" step="0.01" className={inputClass}/></label>
      <label className="text-xs font-medium text-[#53637a] sm:col-span-2">Pickup location<input name="pickup_location" maxLength={200} className={inputClass}/></label>
    </div>
    <label className="block text-xs font-medium text-[#53637a]">Anything else we should know?<textarea name="message" rows={4} maxLength={2000} className={inputClass}/></label>
    <p className="text-xs leading-5 text-[#68778c]">Your documents are used only to verify your application and are stored privately. Photos and documents can be provided after we contact you.</p>
    <label className="flex items-start gap-2 text-xs leading-5 text-[#53637a]"><input type="checkbox" name="accepted_terms" required className="mt-1"/>I agree to the <a href="/terms" className="text-[#2457d6] underline">Terms</a> and the owner policy.</label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <button disabled={busy} className="inline-flex h-11 items-center justify-center rounded-lg bg-[#2457d6] px-5 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Submitting…" : "Submit application"}</button>
  </form>;
}
