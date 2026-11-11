"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Preferences = { email_enabled: boolean; push_enabled: boolean; muted_types: string[] };
const optionalTypes = ["booking_created", "new_booking", "pickup_tomorrow"];

export function NotificationSettings({ userId, initial }: { userId: string; initial: Preferences | null }) {
  const [prefs, setPrefs] = useState<Preferences>(initial ?? { email_enabled: true, push_enabled: true, muted_types: [] });
  const [message, setMessage] = useState("");
  async function save(next: Preferences) {
    setPrefs(next); setMessage("");
    const { error } = await createClient().from("notification_preferences").upsert({ user_id: userId, ...next });
    setMessage(error ? error.message : "Settings saved.");
  }
  const toggle = (label: string, checked: boolean, change: (value: boolean) => Preferences) => <label className="flex items-center justify-between gap-4 border-b py-4 text-sm"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => void save(change(event.target.checked))}/></label>;
  return <section className="mt-6 rounded-xl border bg-white px-5"><h2 className="pt-5 font-semibold">Delivery</h2>{toggle("Email notifications", prefs.email_enabled, (value) => ({ ...prefs, email_enabled: value }))}<h2 className="pt-5 font-semibold">Optional updates</h2>{optionalTypes.map((type) => toggle(type.replaceAll("_", " "), !prefs.muted_types.includes(type), (value) => ({ ...prefs, muted_types: value ? prefs.muted_types.filter((item) => item !== type) : [...prefs.muted_types, type] })))}<p className="py-4 text-xs text-slate-500">Critical payment and account alerts are always on.</p>{message && <p aria-live="polite" className="pb-4 text-sm text-slate-600">{message}</p>}</section>;
}
