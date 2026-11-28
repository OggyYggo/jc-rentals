"use client";

import { useEffect, useRef, useState } from "react";
import { Laptop, Smartphone } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { ResponsiveSheet } from "@/components/ui/responsive-sheet";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { exactTime } from "@/lib/audit/labels";
import {
  browserPushSubscription, pushDevices, pushEnvironment, PushRequestError, pushState,
  registerPushAlerts, removePushDevice, stopPushAlerts, subscribeBrowserPush, type DevicePushState, type PushDevice,
} from "@/lib/notifications/push-browser";

export const alertAction = "inline-flex min-h-11 items-center justify-center rounded-lg border border-[#D6E6F7] px-3 text-sm font-semibold text-[#0A47B1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A47B1] disabled:opacity-50";
export const alertPrimary = `${alertAction} border-[#0A47B1] bg-[#0A47B1] text-white`;

const deviceStates = { mine: "On", other: "Linked to another account", none: "Off", loading: "Checking this device…", error: "Could not check this device" };
type DialogChoice = { type: "transfer" } | { type: "remove"; device: PushDevice };
const helpTabs = [{ key: "android", label: "Android" }, { key: "iphone", label: "iPhone" }] as const;

function PhoneAlertHelp({ ios, supportEmail }: { ios: boolean; supportEmail: string }) {
  const [help, setHelp] = useState<"android" | "iphone">(ios ? "iphone" : "android");
  return <div className="mt-3 space-y-2 rounded-xl bg-[#F3F9FF] p-3 text-sm text-[#0F2342]">
    <h3 className="font-semibold">Can’t turn on alerts?</h3>
    <SegmentedTabs label="Phone alert help" tabs={helpTabs} value={help} onChange={setHelp}>
      {help === "iphone" ? <ol className="list-decimal space-y-1 pl-5">
        <li>Open Kuyog Bohol in Safari.</li><li>Tap Share, then Add to Home Screen.</li>
        <li>Open the installed app, go to Notifications, and tap Turn on alerts.</li>
      </ol> : <p>Open your browser’s site settings for Kuyog Bohol and allow Notifications. Then come back and tap Turn on alerts.</p>}
    </SegmentedTabs>
    <a className={`${alertAction} max-w-full break-all bg-white`} href={`mailto:${supportEmail}`}>Email support</a>
  </div>;
}

export function PhoneAlerts({ vapidPublicKey, supportEmail }: { vapidPublicKey: string; supportEmail: string }) {
  const [state, setState] = useState<keyof typeof deviceStates>("loading");
  const [devices, setDevices] = useState<PushDevice[] | "loading" | "error">("loading");
  const [environment, setEnvironment] = useState<ReturnType<typeof pushEnvironment>>();
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<DialogChoice | null>(null);
  const [message, setMessage] = useState("");
  const [revision, refresh] = useState(0);
  const trigger = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const abort = new AbortController();
    void (async () => {
      setEnvironment(pushEnvironment());
      let subscription: PushSubscription | null = null;
      let failed = false;
      try { subscription = await browserPushSubscription(); } catch { failed = true; }
      if (abort.signal.aborted) return;
      const stateCheck = subscription ? pushState(subscription.endpoint, abort.signal)
        : Promise.resolve<DevicePushState | "error">(failed ? "error" : "none");
      void stateCheck.then(next => { if (!abort.signal.aborted) setState(next); })
        .catch(() => { if (!abort.signal.aborted) setState("error"); });
      void pushDevices(subscription?.endpoint, abort.signal).then(next => { if (!abort.signal.aborted) setDevices(next); })
        .catch(() => { if (!abort.signal.aborted) setDevices("error"); });
    })();
    return () => abort.abort();
  }, [revision]);

  useEffect(() => {
    const update = () => setEnvironment(pushEnvironment());
    window.addEventListener("focus", update);
    return () => window.removeEventListener("focus", update);
  }, []);

  function reload() { refresh(value => value + 1); }
  function retry() { setDevices("loading"); setState("loading"); reload(); }

  async function turnOn(transfer = false) {
    setBusy(true); setMessage("");
    try {
      const current = state === "none" && !transfer
        ? await subscribeBrowserPush(vapidPublicKey) : await browserPushSubscription();
      if (current && !transfer && await pushState(current.endpoint) === "other") {
        setState("other"); setDialog({ type: "transfer" }); return;
      }
      setEnvironment(pushEnvironment());
      if (!current) {
        setMessage(Notification.permission === "denied" ? "Notifications are blocked in this browser." : "Allow notifications to turn on alerts.");
        return;
      }
      await registerPushAlerts(current, transfer);
      setState("mine"); setMessage("Phone alerts are on for this device."); reload();
    } catch (error) {
      if (error instanceof PushRequestError && error.status === 409) {
        setState("other");
        if (!transfer) setDialog({ type: "transfer" });
        else setMessage("This phone is set up for another account. We couldn’t switch its alerts.");
      } else setMessage(error instanceof PushRequestError && error.status === 503 ? "Alerts are not set up on the server yet."
        : error instanceof PushRequestError && error.status === 429 ? "Try again in a minute." : "Could not turn on alerts. Try again.");
    } finally { setBusy(false); }
  }

  async function turnOff() {
    setBusy(true); setMessage("");
    try {
      const current = await browserPushSubscription();
      if (current) await stopPushAlerts(current);
      setMessage("Phone alerts are off for this device."); reload();
    } catch { setMessage("Could not turn off alerts. Try again."); }
    finally { setBusy(false); }
  }

  async function remove(device: PushDevice) {
    setBusy(true); setMessage("");
    try {
      const current = await browserPushSubscription();
      const { removed } = await removePushDevice(device.id, current?.endpoint);
      setMessage(removed ? "Device removed." : "This device is no longer available to remove.");
      reload();
    } catch { setMessage("Could not remove this device. Try again."); }
    finally { setBusy(false); heading.current?.focus({ preventScroll: true }); }
  }

  const showHelp = Boolean(environment && (environment.blocked || !environment.supported || (environment.ios && !environment.installed)));
  const ready = environment?.supported && !showHelp && Boolean(vapidPublicKey);
  return <section className="mt-6 space-y-4 rounded-2xl border border-[#D6E6F7] bg-white p-4 font-body text-sm text-[#0F2342] sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 className="font-heading text-base font-bold">Phone alerts</h2>
        <p className="mt-1 text-[#5B6F89]">Get alerts when Kuyog Bohol is closed.</p>
        <p role="status" className={`mt-2 w-fit rounded-full px-2.5 py-1 text-[13px] font-semibold ${state === "mine" ? "bg-[#E3F7EA] text-[#12703A]" : state === "other" ? "bg-[#FFF2D6] text-[#8A5A00]" : "bg-[#EAF4FF] text-[#0A3D91]"}`}>{deviceStates[state]}</p>
      </div>
      {state === "mine" ? <button type="button" className={alertAction} disabled={busy} onClick={() => void turnOff()}>Turn off</button>
        : state === "error" ? <button type="button" onClick={retry} className={alertAction}>Try again</button>
          : <button type="button" className={alertPrimary} disabled={!ready || busy || state === "loading"} onClick={event => {
            trigger.current = event.currentTarget;
            if (state === "other") setDialog({ type: "transfer" });
            else void turnOn();
          }}>Turn on alerts</button>}
    </div>
    {!vapidPublicKey && <p role="status" className="text-[#5B6F89]">Alerts are not set up on the server yet.</p>}
    {environment?.blocked && <p role="status" className="text-[#8A5A00]">Notifications are blocked in this browser.</p>}
    {showHelp && <PhoneAlertHelp ios={environment?.ios ?? false} supportEmail={supportEmail} />}
    {message && <p role="status" className="text-[#0A3D91]">{message}</p>}
    <div className="border-t border-[#E3EEF9] pt-4">
      <h3 ref={heading} tabIndex={-1} className="font-heading font-bold">Your devices{Array.isArray(devices) ? ` (${devices.length})` : ""}</h3>
      <p className="mt-1 text-[#5B6F89]">To get alerts on another phone or laptop, sign in there and tap Turn on alerts. Each device is set up on its own.</p>
      {devices === "loading" ? <div role="status" aria-label="Loading your devices" className="mt-3 h-14 rounded-xl bg-[#EAF4FF] motion-safe:animate-pulse" />
        : devices === "error" ? <div className="mt-3 flex flex-wrap items-center gap-2"><p role="status">Could not load your devices.</p><button type="button" className={alertAction} onClick={retry}>Try again</button></div>
          : !devices.length ? <p className="mt-3 text-[#5B6F89]">No devices linked yet.</p>
            : <ul className="mt-2 divide-y divide-[#E3EEF9]">{devices.map(device => {
              const Icon = device.kind === "phone" ? Smartphone : Laptop;
              return <li key={device.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#EAF4FF] text-[#0A47B1]"><Icon size={19} aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <p className="break-words font-semibold">{device.name}</p>
                  <p className="text-[13px] text-[#5B6F89]">{device.last_used_at
                    ? <>Last alert <time dateTime={device.last_used_at}>{exactTime(device.last_used_at)}</time></>
                    : <>Added <time dateTime={device.created_at}>{exactTime(device.created_at)}</time> · No alerts yet</>}</p>
                </div>
                {device.current ? <span className="rounded-full bg-[#EAF4FF] px-2.5 py-1 text-[13px] font-semibold text-[#0A47B1]">This device</span>
                  : <button type="button" className={alertAction} disabled={busy || state === "error" || state === "loading"} aria-label={`Remove ${device.name}`} onClick={event => {
                    trigger.current = event.currentTarget; setDialog({ type: "remove", device });
                  }}>Remove</button>}
              </li>;
            })}</ul>}
    </div>
    {dialog && <Dialog.Root open onOpenChange={open => { if (!open) setDialog(null); }}>
      <ResponsiveSheet finalFocus={trigger}>
        <Dialog.Title className="font-heading text-xl font-bold">{dialog.type === "transfer" ? "This phone is set up for another account" : `Remove ${dialog.device.name}?`}</Dialog.Title>
        <Dialog.Description className="mt-2 text-[#5B6F89]">{dialog.type === "transfer"
          ? "Alerts on this phone currently go to another account. Switch them to your account? That account will stop getting alerts on this phone. Only switch on a phone you use."
          : "This device will stop receiving alerts for your account."}</Dialog.Description>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Dialog.Close className={alertAction}>{dialog.type === "transfer" ? "Not now" : "Cancel"}</Dialog.Close>
          <button type="button" className={alertPrimary} onClick={() => {
            setDialog(null);
            if (dialog.type === "transfer") void turnOn(true);
            else void remove(dialog.device);
          }}>{dialog.type === "transfer" ? "Switch alerts to my account" : "Remove device"}</button>
        </div>
      </ResponsiveSheet>
    </Dialog.Root>}
  </section>;
}
