import "server-only";

import type { getAdminContext } from "@/lib/admin-context";
import { exactTime } from "@/lib/audit/labels";
import { paymentPeso } from "@/lib/payment-format";

const defaults = {
  bookings_paused: false, default_commission_rate: 0.05, rental_policies: "", deposit_percent: 0.3,
  payment_window_hours: 24, payment_review_hours: 12, payment_resubmit_grace_hours: 2, refund_due_days: 3,
  credit_low_threshold: 200, min_credit_to_list: 500, invoice_grace_days: 7, platform_account_name: "",
  platform_qr_path: "", payment_instructions: "", cancellation_free_hours: 24, cancellation_fee_percent: 50,
  pickup_reference_hour: 8, pickup_early_days: 1, pickup_late_days: 0, pickup_require_verified_docs: true,
};

export async function loadPlatformSettings(supabase: Awaited<ReturnType<typeof getAdminContext>>["supabase"]) {
  const { data, error } = await supabase.from("settings").select("key,value,updated_at").in("key", Object.keys(defaults));
  if (error) return null;
  const rows = new Map((data ?? []).map(row => [row.key, row]));
  const values = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof typeof defaults)[]) {
    const row = rows.get(key);
    if (row?.value == null) continue;
    Object.assign(values, { [key]: typeof defaults[key] === "number" ? Number(row.value)
      : key === "pickup_require_verified_docs" ? row.value !== false
        : typeof defaults[key] === "boolean" ? row.value === true : String(row.value) });
  }
  return { values, policiesUpdated: rows.get("rental_policies")?.updated_at ?? null };
}

export type PlatformSettings = NonNullable<Awaited<ReturnType<typeof loadPlatformSettings>>>;
export const settingsGroups = [
  { label: "Owners and fees", sections: ["owner-defaults", "credits", "invoices"] },
  { label: "Bookings and payments", sections: ["payment-timing", "cancellation", "pickup"] },
  { label: "Customer-facing", sections: ["rental-policies", "platform-payment"] },
  { label: "Notifications", sections: ["email-alerts", "phone-alerts"] },
] as const;
export const sections = {
  "owner-defaults": { label: "New owner defaults", description: "Set the commission rate for new owners." },
  credits: { label: "Credits and listing", description: "Set the balance owners need to keep vehicles listed." },
  invoices: { label: "Invoices", description: "Set the grace period for platform invoices." },
  "payment-timing": { label: "Payment timing", description: "Set payment deadlines and when owners get a low-credit reminder." },
  cancellation: { label: "Cancellation", description: "Set the free cancellation window and late fee." },
  pickup: { label: "Pickup rules", description: "Set pass validity and document requirements." },
  "rental-policies": { label: "Rental policies", description: "Edit the rental policies customers see." },
  "platform-payment": { label: "Platform payment QR", description: "Manage the payment QR, instructions, and default deposit." },
  "email-alerts": { label: "Email alerts", description: "Manage recipients, rules, and the daily summary." },
  "phone-alerts": { label: "Phone alerts", description: "Manage phone notifications and linked devices." },
};
export type SettingsSection = keyof typeof sections;

export function settingsSummaries(settings: PlatformSettings | null) {
  if (!settings) return {};
  const { values: v, policiesUpdated } = settings;
  return {
    "owner-defaults": `${(v.default_commission_rate * 100).toLocaleString("en-PH")}% default commission`,
    credits: `${paymentPeso(v.min_credit_to_list)} to list · ${paymentPeso(v.credit_low_threshold)} reminder`,
    invoices: `${v.invoice_grace_days} days grace`,
    "payment-timing": `${v.payment_window_hours} hours to pay · ${v.payment_review_hours} hours to review`,
    cancellation: `${v.cancellation_free_hours} hours free · ${v.cancellation_fee_percent}% late fee`,
    pickup: `${v.pickup_early_days} days early · ${v.pickup_late_days} days after rental`,
    "rental-policies": policiesUpdated ? `Edited ${exactTime(policiesUpdated)}` : "No edits recorded",
    "platform-payment": v.platform_qr_path ? v.platform_account_name || "QR uploaded" : "QR has not been uploaded",
  };
}
