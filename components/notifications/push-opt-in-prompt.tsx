"use client";

import { useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { usePathname } from "next/navigation";

const dismissedKey = "kuyog-push-prompt-dismissed";

export function PushOptInPrompt() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const installed = window.matchMedia("(display-mode: standalone)").matches
      || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    if (!installed || !("serviceWorker" in navigator) || !("PushManager" in window) || sessionStorage.getItem(dismissedKey)) return;
    void (async () => {
      const authCheck = await fetch("/api/push/subscribe");
      if (authCheck.status === 401 || !authCheck.ok) return;
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) { setVisible(true); return; }
      const response = await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(subscription.endpoint)}`);
      if (response.status === 401) return;
      const result = await response.json();
      if (!result.subscribed) setVisible(true);
    })().catch(() => {});
  }, [pathname]);

  function dismiss() {
    sessionStorage.setItem(dismissedKey, "1");
    setVisible(false);
  }

  async function enable() {
    setBusy(true); setMessage("");
    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error("Push notifications are not configured yet.");
      const registration = await navigator.serviceWorker.register("/sw.js");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Allow notifications in your browser settings to enable alerts.");
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidKey(publicKey) });
      const response = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not enable notifications on this device.");
      sessionStorage.setItem(dismissedKey, "1");
      setVisible(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not enable notifications.");
    } finally { setBusy(false); }
  }

  if (!visible) return null;
  return <aside aria-label="Phone notification setup" className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-md rounded-2xl border border-blue-200 bg-white p-4 shadow-2xl sm:inset-x-auto sm:bottom-5 sm:right-5">
    <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700"><BellRing size={19}/></span><div className="min-w-0 flex-1"><p className="font-semibold text-slate-900">Turn on phone alerts?</p><p className="mt-1 text-sm leading-5 text-slate-600">Get updates about bookings and payment proofs even when Kuyog Bohol is closed.</p>{message && <p role="alert" className="mt-2 text-xs text-red-700">{message}</p>}<div className="mt-3 flex items-center gap-2"><button disabled={busy} onClick={() => void enable()} className="rounded-lg bg-blue-700 px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Enabling…" : "Turn on"}</button><button onClick={dismiss} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Not now</button></div></div><button aria-label="Dismiss notification prompt" onClick={dismiss} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X size={16}/></button></div>
  </aside>;
}

function decodeVapidKey(key: string) {
  const padding = "=".repeat((4 - key.length % 4) % 4);
  const raw = window.atob((key + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}
