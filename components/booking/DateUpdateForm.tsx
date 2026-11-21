"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SubmitButton } from "@/components/loading/SubmitButton";

export function DateUpdateForm({ path, from, to, mode, pickup, today, invalid }: {
  path: string; from?: string; to?: string; mode: string; pickup?: string; today: string; invalid: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const key = `booking-summary:${path}`;

  useEffect(() => {
    try {
      const target = sessionStorage.getItem(key);
      if (target === null) return;
      if (target !== window.location.search) return;
      sessionStorage.removeItem(key);
      document.getElementById("booking-summary")?.scrollIntoView({ block: "start" });
    } catch {}
  }, [key, from, to, mode, pickup, pending]);

  const inputClass = "mt-1 h-11 w-full min-w-0 rounded-xl border border-[#D6E6F7] bg-white px-2 text-sm font-normal";
  return <form action={`${path}#booking-summary`} method="get" className="mt-4 grid grid-cols-2 gap-3 text-xs" onSubmit={event => {
    event.preventDefault();
    if (pending) return;
    const fields = new FormData(event.currentTarget);
    const start = String(fields.get("from"));
    const end = String(fields.get("to"));
    if (start < today || end <= start) {
      setError("Choose a return date after pickup.");
      return;
    }
    setError("");
    const params = new URLSearchParams({ from: start, to: end, mode });
    if (pickup) params.set("pickup", pickup);
    try { sessionStorage.setItem(key, `?${params}`); } catch {}
    startTransition(() => router.replace(`${path}?${params}`, { scroll: false }));
  }}>
    <input type="hidden" name="mode" value={mode} />
    {pickup && <input type="hidden" name="pickup" value={pickup} />}
    <label className="min-w-0 font-semibold">Pickup<input key={from ?? "pickup"} required name="from" type="date" min={today} defaultValue={from} className={inputClass} /></label>
    <label className="min-w-0 font-semibold">Return<input key={to ?? "return"} required name="to" type="date" min={today} defaultValue={to} className={inputClass} /></label>
    {(error || invalid) && <p role="alert" className="col-span-2 text-red-800">{error || "Choose valid rental dates with return after pickup."}</p>}
    <SubmitButton unstyled busy={pending} pendingText="Updating dates…" className="col-span-2 min-h-11 rounded-full border border-[#0B63CE] text-sm font-semibold text-[#0B63CE] disabled:opacity-60">Update dates</SubmitButton>
  </form>;
}
