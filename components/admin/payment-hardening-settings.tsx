"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { runWithAlerts } from "@/lib/alerts/run";
import { createClient } from "@/lib/supabase/client";

const fields = [
  ["p_window", "Payment window (hours)", 24, 1, 168, 1],
  ["p_review", "Review window (hours)", 12, 2, 72, 1],
  ["p_resubmit", "Resubmission grace (hours)", 2, 0, 24, 1],
  ["p_refund", "Refund deadline (days)", 3, 1, 30, 1],
  ["p_threshold", "Minimum low-credit threshold (PHP)", 200, 0, 100000, 0.01],
] as const;

export function PaymentHardeningSettings({ values }: { values: Record<string, number> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parameters = Object.fromEntries(fields.map(([key]) => [key, Number(form.get(key))]));
    await runWithAlerts({
      reason: { title: "Save payment deadlines and thresholds?", label: "Audit reason", confirmText: "Save settings" },
      setPending: setBusy,
      run: async (reason) => {
        const { error } = await createClient().rpc("admin_set_payment_hardening_settings", { ...parameters, p_reason: reason });
        if (error) throw error;
      },
      success: "Payment settings saved",
      refresh: router.refresh,
    });
  }

  return <form onSubmit={save} className="mt-6 max-w-3xl space-y-4 rounded-xl border bg-white p-5">
    <h2 className="font-semibold">Payment deadlines and credit alerts</h2>
    <div className="grid gap-3 sm:grid-cols-2">{fields.map(([key, label, fallback, min, max, step]) =>
      <label key={key} className="text-sm">{label}<input type="number" name={key} min={min} max={max} step={step} required
        defaultValue={values[key] ?? fallback} className="mt-1 block w-full rounded border p-2" /></label>)}</div>
    <button disabled={busy} className="min-h-11 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-50">Save payment deadlines</button>
  </form>;
}
