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
      <p className="mt-1">Our team will review your details and contact you about setting up your owner account.</p>
    </div>;
  }

  return <form onSubmit={submit} className="space-y-4 rounded-2xl border border-[#e3e8ef] bg-white p-5 shadow-sm sm:p-7">
    <div aria-hidden="true" className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
      <label>Leave this field blank<input name="website" tabIndex={-1} autoComplete="off"/></label>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-xs font-medium text-[#53637a]">Your name<input name="full_name" required minLength={2} maxLength={120} autoComplete="name" className={inputClass}/></label>
      <label className="text-xs font-medium text-[#53637a]">Business name<input name="business_name" required minLength={2} maxLength={120} autoComplete="organization" className={inputClass}/></label>
      <label className="text-xs font-medium text-[#53637a]">Email<input name="email" type="email" required maxLength={254} autoComplete="email" className={inputClass}/></label>
      <label className="text-xs font-medium text-[#53637a]">Phone<input name="phone" type="tel" required minLength={7} maxLength={30} autoComplete="tel" className={inputClass}/></label>
      <label className="text-xs font-medium text-[#53637a]">Car make<input name="car_make" required minLength={2} maxLength={80} placeholder="Toyota" className={inputClass}/></label>
      <label className="text-xs font-medium text-[#53637a]">Car model<input name="car_model" required maxLength={80} placeholder="Vios" className={inputClass}/></label>
      <label className="text-xs font-medium text-[#53637a]">Car year (optional)<input name="car_year" type="number" min="1900" max="2100" className={inputClass}/></label>
    </div>
    <label className="block text-xs font-medium text-[#53637a]">Anything else we should know?<textarea name="message" rows={4} maxLength={2000} className={inputClass}/></label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <button disabled={busy} className="inline-flex h-11 items-center justify-center rounded-lg bg-[#2457d6] px-5 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Submitting…" : "Submit application"}</button>
  </form>;
}
