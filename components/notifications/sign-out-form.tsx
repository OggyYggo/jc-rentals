"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { browserPushSubscription, pushState, stopPushAlerts } from "@/lib/notifications/push-browser";
import { alertAction, alertPrimary } from "./phone-alerts";

export function SignOutForm({ className, children }: { className?: string; children: ReactNode }) {
  const form = useRef<HTMLFormElement>(null);
  const sheet = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const inFlight = useRef(false);
  const title = useId();
  const description = useId();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [checkMessage, setCheckMessage] = useState("");

  function signOut() { form.current?.submit(); }

  async function check() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setMessage(""); setCheckMessage("");
    try {
      const current = await browserPushSubscription();
      if (current && await pushState(current.endpoint) === "mine") sheet.current?.showModal();
      else signOut();
    } catch {
      setCheckMessage("We couldn’t check whether alerts are on for this phone.");
      sheet.current?.showModal();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function stopAndSignOut() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setMessage("");
    try {
      const current = await browserPushSubscription();
      if (current) await stopPushAlerts(current);
      signOut();
    } catch { setMessage("Could not stop alerts. Try again or keep alerts and sign out."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <form ref={form} action="/auth/signout" method="post" className={className} aria-busy={busy || undefined} onSubmit={event => {
    event.preventDefault();
    if (sheet.current?.open || inFlight.current) return;
    trigger.current = (event.nativeEvent as SubmitEvent).submitter ?? null;
    void check();
  }}>
    {children}
    <dialog ref={sheet} aria-labelledby={title} aria-describedby={description}
      onCancel={event => { if (inFlight.current) event.preventDefault(); }}
      onClose={() => trigger.current?.focus({ preventScroll: true })}
      className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[90dvh] w-full max-w-none overflow-y-auto rounded-t-3xl bg-white px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] font-body text-sm text-[#0F2342] shadow-xl backdrop:bg-[#0F2342]/45 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[min(32rem,calc(100%-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:p-6">
        <h2 id={title} className="font-heading text-xl font-bold">Sign out of Kuyog Bohol?</h2>
        <p id={description} className="mt-2 text-[#5B6F89]">On a shared phone, choose Stop alerts.</p>
        {checkMessage && <p className="mt-2 text-[#5B6F89]">{checkMessage}</p>}
        {message && <p role="alert" className="mt-2 text-[#A12A2A]">{message}</p>}
        <div className="mt-4 grid gap-2">
          <button type="button" className={alertPrimary} disabled={busy} onClick={() => void stopAndSignOut()}>{busy ? "Stopping alerts…" : "Stop alerts and sign out"}</button>
          <button type="button" className={alertAction} disabled={busy} onClick={signOut}>Keep alerts and sign out</button>
          <button type="button" className={alertAction} disabled={busy} onClick={() => sheet.current?.close()}>Cancel</button>
        </div>
    </dialog>
  </form>;
}
