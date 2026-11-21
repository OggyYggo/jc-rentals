"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { runWithAlerts } from "@/lib/alerts/run";

type Props = { hours: number | null; percent: number | null; pickupHour?: number; ownerId?: string; userId?: string };

export function CancellationSettings({ hours, percent, pickupHour, ownerId, userId }: Props) {
  const router = useRouter();
  const [freeHours, setFreeHours] = useState(hours?.toString() ?? "");
  const [feePercent, setFeePercent] = useState(percent?.toString() ?? "");
  const [busy, setBusy] = useState(false);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const window = freeHours === "" ? null : Number(freeHours);
    const fee = feePercent === "" ? null : Number(feePercent);
    return runWithAlerts({
      confirm: {
        title: ownerId ? "Save policy override?" : "Save cancellation policy?",
        text: "The change applies to new bookings.",
        confirmText: "Save policy",
      },
      setPending: setBusy,
      run: async () => {
        const db = createClient();
        const { error } = ownerId
          ? await db.rpc("admin_set_cancellation_override", { p_owner_id: ownerId, p_free_hours: window, p_fee_percent: fee })
          : await db.from("settings").upsert([
              { key: "cancellation_free_hours", value: window, updated_by: userId },
              { key: "cancellation_fee_percent", value: fee, updated_by: userId },
              { key: "pickup_reference_hour", value: Number(form.get("pickupHour")), updated_by: userId },
            ]);
        if (error) throw error;
      },
      success: "Cancellation policy saved",
      refresh: router.refresh,
    });
  }

  const input = "mt-1 block w-full rounded-lg border p-2";
  return <form onSubmit={save} className="mt-6 max-w-3xl space-y-4 rounded-xl border border-slate-200 bg-white p-5 text-sm">
    <h2 className="font-semibold">{ownerId ? "Policy override" : "Cancellation policy"}</h2>
    {ownerId && <p>Leave a field blank to use the platform default.</p>}
    <div className="grid gap-4 sm:grid-cols-3">
      <label>Free window (hours)<input className={input} required={!ownerId} type="number" min={0} max={168} value={freeHours} onChange={e => setFreeHours(e.target.value)}/></label>
      <label>Fee percent<input className={input} required={!ownerId} type="number" min={0} max={100} step="0.01" value={feePercent} onChange={e => setFeePercent(e.target.value)}/></label>
      {!ownerId && <label>Pickup reference hour (Manila)<input className={input} required name="pickupHour" type="number" min={0} max={23} defaultValue={pickupHour}/></label>}
    </div>
    {!ownerId && freeHours !== "" && feePercent !== "" && <p>Cancel up to {freeHours} hours before pickup for a full refund. After that, the owner keeps {feePercent}% of your reservation payment.</p>}
    <button disabled={busy} className="rounded bg-blue-700 px-4 py-2 font-semibold text-white">{busy ? "Saving…" : "Save policy"}</button>
  </form>;
}
