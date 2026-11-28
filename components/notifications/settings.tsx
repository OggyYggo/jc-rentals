"use client";

import { useContext, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NotificationSoundContext } from "./sound";
import { PhoneAlerts } from "./phone-alerts";

type Preferences = { email_enabled: boolean; push_enabled: boolean; muted_types: string[] };
const optionalTypes = ["booking_created", "new_booking", "pickup_tomorrow"];

export function NotificationSettings({ userId, initial, vapidPublicKey, supportEmail }: {
  userId: string; initial: Preferences | null; vapidPublicKey: string; supportEmail: string;
}) {
  const sound = useContext(NotificationSoundContext);
  const [prefs, setPrefs] = useState(initial ?? { email_enabled: true, push_enabled: true, muted_types: [] });
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(next: Pick<Partial<Preferences>, "email_enabled" | "muted_types">) {
    setSaving(true); setMessage("");
    try {
      const { error } = await createClient().from("notification_preferences").upsert({ user_id: userId, ...next });
      if (error) throw error;
      setPrefs(current => ({ ...current, ...next }));
      setMessage("Settings saved.");
    } catch {
      setMessage("Could not save notification settings. Try again.");
    } finally { setSaving(false); }
  }

  const toggle = (label: string, checked: boolean, change: (value: boolean) => void) =>
    <label className="flex min-h-11 items-center justify-between gap-4 border-b py-3 text-sm">
      <span>{label}</span><input type="checkbox" role="switch" aria-checked={checked} checked={checked} disabled={saving}
        className="size-5 accent-[#0A47B1] focus-visible:outline-2 focus-visible:outline-offset-2"
        onChange={event => change(event.target.checked)} />
    </label>;

  return <>
    <section className="mt-6 rounded-xl border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Notification sound</h2>
          <p className="mt-1 text-[13px] text-slate-500">Play a chime for new notifications while this Kuyog tab is active.</p>
        </div>
        <button type="button" disabled={sound.busy} onClick={sound.toggle} className="min-h-11 rounded-lg border px-3 py-2 text-sm focus-visible:outline-2 disabled:opacity-50">
          {sound.busy ? "Enabling…" : sound.blocked ? "Resume sound" : sound.enabled ? "Turn off sound" : "Enable sound"}
        </button>
      </div>
      {sound.error && <p role="alert" className="mt-2 text-[13px] text-red-700">{sound.error}</p>}
    </section>
    <PhoneAlerts vapidPublicKey={vapidPublicKey} supportEmail={supportEmail} />
    <section className="mt-6 rounded-xl border bg-white px-5">
      <h2 className="pt-5 font-semibold">Delivery</h2>
      {toggle("Email notifications", prefs.email_enabled, value => void save({ email_enabled: value }))}
      <h2 className="pt-5 font-semibold">Optional updates</h2>
      {optionalTypes.map(type => <div key={type}>{toggle(type.replaceAll("_", " "), !prefs.muted_types.includes(type),
        value => void save({ muted_types: value ? prefs.muted_types.filter(item => item !== type) : [...prefs.muted_types, type] }))}</div>)}
      <p className="py-4 text-[13px] text-slate-500">Critical payment and account alerts are always on.</p>
      {message && <p role="status" className="pb-4 text-sm text-slate-600">{message}</p>}
    </section>
  </>;
}
