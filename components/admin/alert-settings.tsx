"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { retryAlert, saveAlertDigest, saveAlertRecipients, saveAlertRule, sendTestAlert } from "@/app/admin/settings/alert-actions";
import { normalizeEmail } from "@/lib/admin-alerts/config";
import type { alertSettings } from "@/lib/admin-alerts/settings";
import { runWithAlerts } from "@/lib/alerts/run";
import { exactTime } from "@/lib/audit/labels";

type Settings = NonNullable<Awaited<ReturnType<typeof alertSettings>>>;
const modes = { instant: "Instant", digest: "Daily digest", off: "Off" } as const;
const button = "rounded-md border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-50";
const statusLabels: Record<string, string> = { sent: "Sent", pending: "Waiting", digest: "Waiting for digest", digested: "Digested", failed: "Failed" };

export function AlertSettings({ settings }: { settings: Settings | null }) {
  const router = useRouter();
  const [addresses, setAddresses] = useState(settings?.config.recipients.length ? settings.config.recipients : settings?.environment ?? []);
  const [draft, setDraft] = useState("");
  const [validation, setValidation] = useState("");
  const [busy, setBusy] = useState(false);
  if (!settings) return <section id="email-alerts" className="mt-6 rounded-xl border bg-white p-4">
    <h2 className="font-semibold">Email alerts</h2><p role="status" className="text-sm">Could not load email alert settings.</p>
  </section>;
  const { config, rules, queue } = settings;

  function addAddress() {
    const email = normalizeEmail(draft);
    if (!email || addresses.includes(email) || addresses.length >= 5) {
      setValidation("Enter a valid address that is not already in the list. You can add up to five.");
      return;
    }
    setAddresses([...addresses, email]);
    setDraft("");
    setValidation("");
  }

  function change(run: () => Promise<{ error?: string }>, success: string) {
    return runWithAlerts({
      run: async () => { const result = await run(); if (result.error) throw new Error(result.error); },
      success, setPending: setBusy, refresh: router.refresh, errorType: "toast",
    });
  }

  function saveRecipients() {
    return runWithAlerts({
      confirm: { title: "Save alert recipients?", text: "Previous recipients receive a security notice. The new recipients receive a test email.", confirmText: "Save recipients" },
      run: async () => {
        const result = await saveAlertRecipients(addresses);
        if (result.error) throw new Error(result.error);
        return result;
      },
      success: "Recipients saved. Check delivery status for the notice and test email.",
      setPending: setBusy, refresh: router.refresh, errorType: "toast",
    });
  }

  return <section id="email-alerts" className="mt-6 scroll-mt-24 space-y-5 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-800 sm:p-5">
    <h2 className="text-base font-semibold">Email alerts</h2>
    <div className="space-y-2">
      <h3 className="font-semibold">Recipients</h3>
      <p className="text-slate-600">Use a shared inbox protected with two-step verification.</p>
      {!settings.senderReady && <p className="text-amber-800">Email delivery configuration is incomplete.</p>}
      <ul className="flex flex-wrap gap-2">{addresses.map(email => <li key={email} className="flex min-w-0 max-w-full items-center gap-2 rounded-lg bg-slate-100 px-2 py-1">
        <span className="break-all">{email}</span>
        <button type="button" disabled={busy} aria-label={`Remove ${email}`} onClick={() => setAddresses(addresses.filter(item => item !== email))}>×</button>
      </li>)}</ul>
      <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); addAddress(); }}>
        <input type="email" aria-label="Email address to add" value={draft} onChange={event => setDraft(event.target.value)}
          maxLength={120} className="min-w-0 rounded-md border border-slate-300 px-2 py-2" placeholder="Email address"/>
        <button className={button} disabled={busy || addresses.length >= 5}>Add email</button>
      </form>
      {validation && <p role="alert" className="text-red-700">{validation}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={busy || !addresses.length || Boolean(draft)} onClick={saveRecipients}>Save recipients</button>
        <button type="button" className={button} disabled={busy} onClick={() => change(sendTestAlert, "Test email sent.")}>Send test email</button>
      </div>
      <p className="text-slate-600">{settings.last ? `Last email sent ${exactTime(settings.last)} (Manila)` : "No email has been sent yet."} · Failed in the last 24 hours {settings.failed}</p>
    </div>

    <fieldset className="space-y-2 border-t border-slate-200 pt-3">
      <legend className="font-semibold">Daily summary</legend>
      <label className="flex items-start gap-2"><input type="checkbox" checked={config.digest_enabled} disabled={busy}
        onChange={event => change(() => saveAlertDigest(event.target.checked, config.digest_even_if_empty), "Daily summary updated.")}/>Send a daily summary at 8:00 AM Manila time</label>
      <label className="flex items-start gap-2"><input type="checkbox" checked={config.digest_even_if_empty} disabled={busy || !config.digest_enabled}
        onChange={event => change(() => saveAlertDigest(config.digest_enabled, event.target.checked), "Daily summary updated.")}/>Also send when nothing is waiting</label>
    </fieldset>

    <div className="space-y-2 border-t border-slate-200 pt-3">
      <h3 className="font-semibold">Email alert rules</h3>
      <div className="divide-y divide-slate-100">{rules.map(rule => <div key={rule.event_key} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <div><p className="font-medium">{rule.label}</p><p className="text-xs text-slate-600">{rule.description}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">Default {modes[rule.default_mode]}
            {rule.locked && <span className="inline-flex items-center gap-1"><LockKeyhole size={12} aria-hidden/>Always on</span>}</p></div>
        <div role="group" aria-label={rule.label} className="flex flex-wrap gap-1">
          {Object.entries(modes).map(([mode, label]) => <button type="button" key={mode} aria-pressed={mode === rule.mode}
            className={`${button} ${mode === rule.mode ? "bg-blue-50 text-blue-800" : ""}`} disabled={busy || (rule.locked && mode === "off")}
            onClick={() => change(() => saveAlertRule(rule.event_key, mode), "Alert rule updated.")}>{label}</button>)}
        </div>
      </div>)}</div>
    </div>

    <div className="border-t border-slate-200 pt-3">
      <h3 className="font-semibold">Recent email delivery</h3>
      {!queue.length ? <p className="mt-2 text-slate-600">No recent alerts.</p> : <ul className="divide-y divide-slate-100">
        {queue.map(row => <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <div className="min-w-0 break-words"><p>{row.title}</p><time className="text-xs text-slate-600" dateTime={row.created_at}>{exactTime(row.created_at)}</time>
            {row.status === "failed" && <p className="text-xs text-red-700">{row.last_error}</p>}</div>
          <div className="flex items-center gap-2"><span className="rounded-md bg-slate-100 px-2 py-1 text-xs">{statusLabels[row.status]}</span>
            {row.status === "failed" && <button type="button" className={button} disabled={busy} onClick={() => change(() => retryAlert(row.id), "Retry requested.")}>Retry</button>}</div>
        </li>)}
      </ul>}
    </div>
  </section>;
}
