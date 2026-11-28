"use client";

import { runWithAlerts } from "@/lib/alerts/run";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { adminInputClass } from "@/components/admin/ui";
import { MobileSettingsEditor } from "./mobile-settings-editor";

export async function updatePlatformSettings(entries: { key: string; value: string | number | boolean }[], updatedBy: string) {
  const savedAt = new Date().toISOString();
  const { error } = await createClient().from("settings").upsert(entries.map(entry => ({
    ...entry, updated_at: savedAt, updated_by: updatedBy,
  })));
  if (error) throw error;
}

export function PlatformSettingsForm({ commissionRate, policies, updatedBy, bookingsPaused, mobileSection }: { bookingsPaused: boolean; commissionRate: number; policies: string; updatedBy: string; mobileSection?: "owner-defaults" | "rental-policies" }) {
  const [rate, setRate] = useState(String(commissionRate * 100)); const [text, setText] = useState(policies); const [saving, setSaving] = useState(false); const [message, setMessage] = useState(""); const router = useRouter();
  const [paused, setPaused] = useState(bookingsPaused);
  async function persist(nextRate: string, nextText: string, nextPaused: boolean) {
    setMessage("");
    const parsed = Number(nextRate);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      setMessage("Commission must be between 0% and 100%.");
      return false;
    }
    const changes = [
      ...(nextPaused !== bookingsPaused ? [nextPaused ? "Pause new booking requests." : "Resume new booking requests."] : []),
      ...(parsed !== commissionRate * 100 ? [`Default commission ${commissionRate * 100}% → ${parsed}%. Applies when creating new owners.`] : []),
      ...(nextText !== policies ? [`Rental policies\nCurrent: ${policies || "(empty)"}\nNew: ${nextText || "(empty)"}`] : []),
    ];
    if (!changes.length) return false;
    const result = await runWithAlerts({
      confirm: mobileSection ? undefined : { title: "Change platform settings?", text: changes.join("\n\n"), confirmText: "Save settings" },
      setPending: setSaving,
      run: () => updatePlatformSettings([
        ...(nextPaused !== bookingsPaused ? [{ key: "bookings_paused", value: nextPaused }] : []),
        ...(parsed !== commissionRate * 100 ? [{ key: "default_commission_rate", value: parsed / 100 }] : []),
        ...(nextText !== policies ? [{ key: "rental_policies", value: nextText }] : []),
      ], updatedBy),
      success: "Platform settings saved",
      refresh: router.refresh,
    });
    return result.ok;
  }
  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void persist(rate, text, paused);
  }
  if (mobileSection) return <>
    <MobileSettingsEditor busy={saving} initial={{ commission: String(commissionRate * 100), policies }}
      fields={mobileSection === "owner-defaults" ? [
        { key: "commission", label: "Default owner commission", type: "number", min: 0, max: 100, step: 0.1, unit: "%", description: "Applied when an administrator creates an owner." },
      ] : [{ key: "policies", label: "Rental policies", type: "textarea", description: "Shown to customers on the platform." }]}
      explanation={mobileSection === "owner-defaults" ? "Existing owner and booking rates stay the same." : undefined}
      onSave={values => persist(String(values.commission), String(values.policies), bookingsPaused)} />
    {message && <p role="alert" className="mt-3 text-sm text-[#A12A2A]">{message}</p>}
  </>;
  return <form onSubmit={save} className="admin-primary-settings max-w-3xl space-y-5 rounded-xl border border-[#e7ecf3] bg-white p-5 shadow-[0_2px_6px_rgba(20,42,78,.025)]"><h2 className="font-semibold lg:hidden">New owner defaults</h2><label className="flex items-center gap-2 text-sm font-semibold text-[#43536a]"><input type="checkbox" checked={paused} onChange={event => setPaused(event.target.checked)} disabled={saving} /> Pause new bookings</label><div><label htmlFor="commission" className="mb-1.5 block text-xs font-semibold text-[#43536a]">Default owner commission (%)</label><input id="commission" type="number" aria-invalid={Boolean(message)} aria-describedby={message ? "default-commission-error" : undefined} min="0" max="100" step="0.1" value={rate} onChange={e => setRate(e.target.value)} className={`${adminInputClass} max-w-xs`}/><p className="mt-1 text-[10px] text-[#8793a3]">Applied when an administrator creates an owner. Existing owner and booking rates are unchanged.</p></div><div className="max-lg:rounded-xl max-lg:border max-lg:border-[#E3EEF9] max-lg:p-3"><label htmlFor="policies" className="mb-1.5 block text-xs font-semibold text-[#43536a]">Rental policies</label><textarea id="policies" rows={12} value={text} onChange={e => setText(e.target.value)} placeholder="Enter the policies shown to customers..." className="w-full rounded-lg border border-[#dfe5ec] bg-white px-3 py-2.5 text-xs leading-5 text-[#43536a] outline-none focus:border-[#94a9e9]"/></div><div className="flex items-center gap-3 max-lg:flex-wrap"><button disabled={saving} className="h-9 max-lg:w-full rounded-lg bg-[#2457d6] px-4 text-xs font-semibold text-white disabled:opacity-60">{saving ? "Saving..." : <><span className="lg:hidden">Save changes</span><span className="hidden lg:inline">Save settings</span></>}</button>{message && <p id="default-commission-error" role="alert" className="text-xs text-red-700">{message}</p>}<p className="text-[13px] text-[#5B6F89] lg:hidden">Changes are written to the audit log.</p></div></form>;
}
