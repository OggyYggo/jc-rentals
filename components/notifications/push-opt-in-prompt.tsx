"use client";

import { useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { readStorage, writeStorage } from "@/lib/onboarding/storage";
import { browserPushSubscription, pushEnvironment, PushRequestError, pushState, registerPushAlerts, subscribeBrowserPush } from "@/lib/notifications/push-browser";

const dismissedKey = "kuyog-push-prompt-dismissed";

export function PushOptInPrompt() {
  const pathname = usePathname();
  const [state, setState] = useState<"none" | "other" | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const { installed, supported, blocked } = pushEnvironment();
    if (!installed || !supported || blocked || readStorage(dismissedKey, true)) return;
    const abort = new AbortController();
    void (async () => {
      const subscription = await browserPushSubscription();
      const next = await pushState(subscription?.endpoint, abort.signal);
      if (!abort.signal.aborted) setState(next === "mine" ? null : next);
    })().catch(() => { if (!abort.signal.aborted) setState(null); });
    return () => abort.abort();
  }, [pathname]);

  function dismiss() {
    writeStorage(dismissedKey, "1", true);
    setState(null);
  }

  async function enable() {
    setBusy(true); setMessage("");
    try {
      const subscription = await subscribeBrowserPush(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "");
      if (!subscription) { setMessage("Allow notifications in your browser settings to enable alerts."); return; }
      await registerPushAlerts(subscription);
      dismiss();
    } catch (error) {
      if (error instanceof PushRequestError && error.status === 409) setState("other");
      else setMessage(error instanceof PushRequestError && error.status === 503
        ? "Alerts are not set up on the server yet." : "Could not enable alerts. Try again.");
    } finally { setBusy(false); }
  }

  if (!state || pathname === "/notifications/settings" || pathname === "/login") return null;
  return <aside aria-label="Phone notification setup" className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-md rounded-2xl border border-blue-200 bg-white p-4 shadow-2xl sm:inset-x-auto sm:bottom-5 sm:right-5">
    <div className="flex items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-700"><BellRing size={19} aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-900">{state === "other" ? "This phone is set up for another account" : "Turn on phone alerts?"}</p>
        <p className="mt-1 text-sm text-slate-600">{state === "other" ? "Open Notification settings to review and switch alerts." : "Get updates about bookings and payment proofs even when Kuyog Bohol is closed."}</p>
        {message && <p role="alert" className="mt-2 text-[13px] text-red-700">{message}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {state === "other" ? <Link href="/notifications/settings" className="inline-flex min-h-11 items-center rounded-lg bg-[#0A47B1] px-3 text-sm font-semibold text-white">Open settings</Link>
            : <button type="button" disabled={busy} onClick={() => void enable()} className="min-h-11 rounded-lg bg-[#0A47B1] px-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Enabling…" : "Turn on"}</button>}
          <button type="button" onClick={dismiss} className="min-h-11 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100">Not now</button>
        </div>
      </div>
      <button type="button" aria-label="Dismiss notification prompt" onClick={dismiss} className="grid size-11 shrink-0 place-items-center rounded text-slate-500 hover:bg-slate-100"><X size={16} aria-hidden /></button>
    </div>
  </aside>;
}
