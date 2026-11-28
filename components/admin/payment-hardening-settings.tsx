"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { runWithAlerts } from "@/lib/alerts/run";
import { createClient } from "@/lib/supabase/client";
import { MobileSettingsEditor, type SettingField } from "./mobile-settings-editor";

const fields = [
  ["p_window", "Payment window (hours)", 24, 1, 168, 1],
  ["p_review", "Review window (hours)", 12, 2, 72, 1],
  ["p_resubmit", "Resubmission grace (hours)", 2, 0, 24, 1],
  ["p_refund", "Refund deadline (days)", 3, 1, 30, 1],
  ["p_threshold", "Minimum low-credit threshold (PHP)", 200, 0, 100000, 0.01],
] as const;

const fieldDetails = [
  ["Payment window", "hours", "How long a customer has to pay and upload proof."],
  ["Review window", "hours", "How long the owner has to review the submitted proof."],
  ["Resubmission grace", "hours", "Extra time to resubmit proof after a rejection."],
  ["Refund deadline", "days", "How long the owner has to send a required refund."],
  ["Low-credit threshold", "PHP", "Send a low-credit reminder when available credits fall below this amount."],
] as const;
const mobileFields: SettingField[] = fields.map(([key, , , min, max, step], index) => ({
  key, label: fieldDetails[index][0], type: "number", unit: fieldDetails[index][1], description: fieldDetails[index][2], min, max, step, required: true,
}));
const exampleTime = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });

function paymentExample(hours: number, review: number) {
  const morning = Date.UTC(2026, 0, 1, 1);
  const days = Math.floor((9 + hours) / 24);
  const dueDay = days === 0 ? "that day" : days === 1 ? "tomorrow" : `${days} days later`;
  return `A customer books at ${exampleTime.format(morning)}. They must pay by ${exampleTime.format(morning + hours * 3_600_000)} ${dueDay}. After they upload, the owner has ${review} hours to confirm.`;
}

export function PaymentHardeningSettings({ values, mobile = false }: { values: Record<string, number>; mobile?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function persist(parameters: Record<string, number>, auditReason?: string) {
    const result = await runWithAlerts({
      prepare: mobile ? async () => auditReason ?? null : undefined,
      reason: mobile ? undefined : { title: "Save payment deadlines and thresholds?", label: "Audit reason", confirmText: "Save settings" },
      setPending: setBusy,
      run: async (reason) => {
        const { error } = await createClient().rpc("admin_set_payment_hardening_settings", { ...parameters, p_reason: reason });
        if (error) throw error;
      },
      success: "Payment settings saved",
      refresh: router.refresh,
    });
    return result.ok;
  }
  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void persist(Object.fromEntries(fields.map(([key]) => [key, Number(form.get(key))])));
  }

  if (mobile) return <MobileSettingsEditor fields={mobileFields} busy={busy} needsReason
    explanation="Deadlines already set on bookings stay the same. The new windows apply when the next payment or refund deadline is assigned."
    initial={Object.fromEntries(fields.map(([key, , fallback]) => [key, String(values[key] ?? fallback)]))}
    onSave={(next, reason) => persist(Object.fromEntries(fields.map(([key]) => [key, Number(next[key])])), reason)}>
    {draft => draft.p_window && draft.p_review ? <p className="rounded-xl bg-[#EAF4FF] p-3 text-sm text-[#0A3D91]">
      {paymentExample(Number(draft.p_window), Number(draft.p_review))}
    </p> : null}
  </MobileSettingsEditor>;
  return <form onSubmit={save} className="mt-6 max-w-3xl space-y-4 rounded-xl border bg-white p-5">
    <h2 className="font-semibold">Payment deadlines and credit alerts</h2>
    <div className="grid gap-3 sm:grid-cols-2">{fields.map(([key, label, fallback, min, max, step]) =>
      <label key={key} className="text-sm">{label}<input type="number" name={key} min={min} max={max} step={step} required
        defaultValue={values[key] ?? fallback} className="mt-1 block w-full rounded border p-2" /></label>)}</div>
    <button disabled={busy} className="min-h-11 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-50">Save payment deadlines</button>
  </form>;
}
