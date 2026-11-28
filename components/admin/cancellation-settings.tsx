"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { runWithAlerts } from "@/lib/alerts/run";
import { MobileSettingsEditor } from "./mobile-settings-editor";

type Props = { hours: number | null; percent: number | null; pickupHour?: number; ownerId?: string; userId?: string; mobile?: boolean };

export function CancellationSettings({ hours, percent, pickupHour, ownerId, userId, mobile = false }: Props) {
  const router = useRouter();
  const [freeHours, setFreeHours] = useState(hours?.toString() ?? "");
  const [feePercent, setFeePercent] = useState(percent?.toString() ?? "");
  const [busy, setBusy] = useState(false);

  async function persist(nextHours: string, nextFee: string, nextPickup: number) {
    const window = nextHours === "" ? null : Number(nextHours);
    const fee = nextFee === "" ? null : Number(nextFee);
    const result = await runWithAlerts({
      confirm: mobile ? undefined : {
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
              { key: "pickup_reference_hour", value: nextPickup, updated_by: userId },
            ]);
        if (error) throw error;
      },
      success: "Cancellation policy saved",
      refresh: router.refresh,
    });
    return result.ok;
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void persist(freeHours, feePercent, Number(form.get("pickupHour")));
  }

  if (mobile) return <MobileSettingsEditor busy={busy}
    initial={{ hours: String(hours ?? ""), fee: String(percent ?? ""), pickup: String(pickupHour ?? "") }}
    fields={[
      { key: "hours", label: "Free cancellation window", type: "number", unit: "hours", min: 0, max: 168, required: true, description: "Customers can get a full refund up to this many hours before pickup." },
      { key: "fee", label: "Late cancellation fee", type: "number", unit: "%", min: 0, max: 100, step: 0.01, required: true, description: "Share of the reservation payment the owner keeps after the free window." },
      { key: "pickup", label: "Pickup reference hour", type: "number", unit: "Manila time", min: 0, max: 23, required: true, description: "Hour of the day used to calculate the cancellation window." },
    ]} explanation="They apply to new bookings only. Bookings already made keep their old times."
    onSave={values => persist(String(values.hours), String(values.fee), Number(values.pickup))} />;
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
