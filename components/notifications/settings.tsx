"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Preferences = { email_enabled: boolean; push_enabled: boolean; muted_types: string[] };
const optionalTypes = ["booking_created", "new_booking", "pickup_tomorrow"];

export function NotificationSettings({ userId, initial, vapidPublicKey }: { userId: string; initial: Preferences | null; vapidPublicKey: string }) {
  const [prefs, setPrefs] = useState<Preferences>(initial ?? { email_enabled: true, push_enabled: true, muted_types: [] });
  const [message, setMessage] = useState("");
  const [hasSubscription, setHasSubscription] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const isIOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
  useEffect(() => {
    setStandalone(window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone)));
    if ("serviceWorker" in navigator) void navigator.serviceWorker.getRegistration("/").then(async (registration) => setHasSubscription(Boolean(await registration?.pushManager.getSubscription())));
  }, []);
  async function save(next: Preferences) {
    setPrefs(next); setMessage("");
    const { error } = await createClient().from("notification_preferences").upsert({ user_id: userId, ...next });
    setMessage(error ? error.message : "Settings saved.");
  }
  const toggle = (label: string, checked: boolean, change: (value: boolean) => Preferences) => <label className="flex items-center justify-between gap-4 border-b py-4 text-sm"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => void save(change(event.target.checked))}/></label>;
  async function enablePush() {
    setPushBusy(true); setMessage("");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("This browser does not support web push.");
      if (!vapidPublicKey) throw new Error("Push notifications are not configured yet.");
      const registration = await navigator.serviceWorker.register("/sw.js");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notification permission was not granted.");
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidKey(vapidPublicKey) });
      const response = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save this device.");
      setHasSubscription(true); setPrefs((current) => ({ ...current, push_enabled: true })); setMessage("Phone notifications are enabled on this device.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not enable push notifications."); }
    finally { setPushBusy(false); }
  }
  async function disablePush() {
    setPushBusy(true); setMessage("");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
        if (!response.ok) throw new Error("Could not remove this device from your account.");
        await subscription.unsubscribe();
      }
      const { error } = await createClient().from("notification_preferences").upsert({ user_id: userId, push_enabled: false });
      if (error) throw error;
      setHasSubscription(false); setPrefs((current) => ({ ...current, push_enabled: false })); setMessage("Phone notifications are disabled on this device.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not disable push notifications."); }
    finally { setPushBusy(false); }
  }
  return <section className="mt-6 rounded-xl border bg-white px-5"><h2 className="pt-5 font-semibold">Delivery</h2>{toggle("Email notifications", prefs.email_enabled, (value) => ({ ...prefs, email_enabled: value }))}<div className="border-b py-4"><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-medium">Phone notifications</p><p className="mt-1 text-xs text-slate-500">Get alerts when this site is closed.</p></div>{hasSubscription ? <button disabled={pushBusy} onClick={() => void disablePush()} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">{pushBusy ? "Working…" : "Turn off"}</button> : !(isIOS && !standalone) && <button disabled={pushBusy || !vapidPublicKey} onClick={() => void enablePush()} className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{pushBusy ? "Working…" : "Turn on alerts"}</button>}</div>{isIOS && !standalone && <p className="mt-3 rounded-lg bg-blue-50 p-3 text-xs leading-5 text-blue-900">On iPhone or iPad, first tap Share, choose Add to Home Screen, then open the installed app and enable alerts here.</p>}</div><h2 className="pt-5 font-semibold">Optional updates</h2>{optionalTypes.map((type) => toggle(type.replaceAll("_", " "), !prefs.muted_types.includes(type), (value) => ({ ...prefs, muted_types: value ? prefs.muted_types.filter((item) => item !== type) : [...prefs.muted_types, type] })))}<p className="py-4 text-xs text-slate-500">Critical payment and account alerts are always on.</p>{message && <p aria-live="polite" className="pb-4 text-sm text-slate-600">{message}</p>}</section>;
}

function decodeVapidKey(key: string) {
  const padding = "=".repeat((4 - key.length % 4) % 4);
  const base64 = (key + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}
