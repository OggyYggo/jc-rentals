"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { ResponsiveSheet } from "@/components/ui/responsive-sheet";
import { runWithAlerts } from "@/lib/alerts/run";
import { updatePlatformSettings } from "./platform-settings-form";
import { mobileAction, mobilePrimaryAction } from "./ui";
import { browserPushSubscription, pushState } from "@/lib/notifications/push-browser";

type Row = { href: string; label: string; value: string };

function PhoneSummary({ value }: { value: string }) {
  const [state, setState] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    void (async () => {
      const subscription = await browserPushSubscription();
      const next = subscription ? await pushState(subscription.endpoint, abort.signal) : "none";
      if (!abort.signal.aborted) setState(next === "mine" ? "On this phone" : next === "other" ? "Linked to another account" : "Off on this phone");
    })().catch(() => { if (!abort.signal.aborted) setState("Could not check this phone"); });
    return () => abort.abort();
  }, []);
  return <>{state && `${state} · `}{value}</>;
}

export function MobileSettingsHome({ paused: initialPaused, userId, groups }: {
  paused: boolean | null; userId: string;
  groups: { label: string; rows: Row[] }[];
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<boolean>();
  const paused = saved ?? initialPaused;
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const action = paused ? "Resume new bookings" : "Pause new bookings";
  async function save() {
    if (paused === null) return;
    setConfirm(false);
    const result = await runWithAlerts({
      run: () => updatePlatformSettings([{ key: "bookings_paused", value: !paused }], userId),
      setPending: setBusy, success: "Platform settings saved", refresh: router.refresh,
    });
    if (result.ok) setSaved(!paused);
  }
  return <div className="space-y-4 font-body text-[#0F2342] lg:hidden">
    <header><h1 className="font-heading text-2xl font-bold">Settings</h1>
      <p className="mt-1 text-sm text-[#5B6F89]">Rules for the whole platform.</p></header>
    <Dialog.Root open={confirm} onOpenChange={setConfirm}>
      <div className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#D6E6F7] p-4 ${paused ? "bg-[#FFF2D6]" : "bg-white"}`}>
        <div><p className="font-heading font-semibold">{paused === null ? "New bookings" : paused ? "New bookings are paused" : "New bookings are on"}</p>
          {paused === null && <p className="text-sm text-[#5B6F89]">Could not load</p>}</div>
        <Dialog.Trigger aria-label="Allow new bookings" role="switch" aria-checked={paused === false} disabled={busy || paused === null}
        className="flex min-h-11 items-center rounded-lg px-1 focus-visible:outline-2 focus-visible:outline-[#0A47B1] disabled:opacity-50">
          <span aria-hidden className={`flex h-7 w-12 items-center rounded-full p-1 ${paused === false ? "bg-[#0A47B1]" : "bg-slate-400"}`}>
            <span className={`size-5 rounded-full bg-white motion-safe:transition-transform ${paused === false ? "translate-x-5" : ""}`} />
          </span>
        </Dialog.Trigger>
      </div>
      <ResponsiveSheet desktopFrom="lg">
        <Dialog.Title className="font-heading text-xl font-bold">{action}?</Dialog.Title>
        <Dialog.Description className="mt-2 text-[#5B6F89]">{paused ? "Customers will be able to send new booking requests again."
          : "Customers will not be able to send new booking requests until you turn this back on. Existing bookings, payments and pickups are not affected. Customers can still browse vehicles."}</Dialog.Description>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Dialog.Close className={mobileAction}>Cancel</Dialog.Close>
          <button type="button" className={`${mobilePrimaryAction} ${paused ? "" : "bg-[#A12A2A]!"}`} onClick={() => void save()}>{action}</button>
        </div>
      </ResponsiveSheet>
    </Dialog.Root>
    {groups.map(group => <section key={group.label}>
      <h2 className="mb-2 font-heading text-sm font-bold">{group.label}</h2>
      <ul className="divide-y divide-[#E3EEF9] rounded-2xl border border-[#D6E6F7] bg-white px-3">
        {group.rows.map(row => <li key={row.href}>
          <Link href={row.href} className="flex min-h-14 items-center gap-2 rounded-lg py-2.5 focus-visible:outline-2 focus-visible:outline-[#0A47B1]">
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{row.label}</span>
              <span className="block break-words text-[13px] text-[#5B6F89]">
                {row.href === "/notifications/settings" ? <PhoneSummary value={row.value} /> : row.value}
              </span></span>
            <ChevronRight size={18} className="shrink-0 text-[#0A47B1]" aria-hidden />
          </Link>
        </li>)}
      </ul>
    </section>)}
    <p className="text-[13px] text-[#5B6F89]">Each page saves by itself. Changes go to the audit log.</p>
  </div>;
}
