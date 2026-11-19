"use client";

import { runWithAlerts } from "@/lib/alerts/run";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { adminInputClass } from "@/components/admin/ui";

export function PlatformSettingsForm({ commissionRate, policies, updatedBy }: { commissionRate: number; policies: string; updatedBy: string }) {
  const [rate, setRate] = useState(String(commissionRate * 100)); const [text, setText] = useState(policies); const [saving, setSaving] = useState(false); const [message, setMessage] = useState(""); const router = useRouter();
  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const parsed = Number(rate);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      setMessage("Commission must be between 0% and 100%.");
      return;
    }
    const changes = [
      ...(parsed !== commissionRate * 100 ? [`Default commission ${commissionRate * 100}% → ${parsed}%. Applies when creating new owners.`] : []),
      ...(text !== policies ? [`Rental policies\nCurrent: ${policies || "(empty)"}\nNew: ${text || "(empty)"}`] : []),
    ];
    if (!changes.length) return;
    return runWithAlerts({
      confirm: { title: "Change platform settings?", text: changes.join("\n\n"), confirmText: "Save settings" },
      setPending: setSaving,
      run: async () => {
        const savedAt = new Date().toISOString();
        const { error } = await createClient().from("settings").upsert([
          { key: "default_commission_rate", value: parsed / 100, updated_at: savedAt, updated_by: updatedBy },
          { key: "rental_policies", value: text, updated_at: savedAt, updated_by: updatedBy },
        ]);
        if (error) throw error;
      },
      success: "Platform settings saved",
      refresh: router.refresh,
    });
  }
  return <form onSubmit={save} className="max-w-3xl space-y-5 rounded-xl border border-[#e7ecf3] bg-white p-5 shadow-[0_2px_6px_rgba(20,42,78,.025)]"><div><label htmlFor="commission" className="mb-1.5 block text-xs font-semibold text-[#43536a]">Default owner commission (%)</label><input id="commission" type="number" aria-invalid={Boolean(message)} aria-describedby={message ? "default-commission-error" : undefined} min="0" max="100" step="0.1" value={rate} onChange={e => setRate(e.target.value)} className={`${adminInputClass} max-w-xs`}/><p className="mt-1 text-[10px] text-[#8793a3]">Applied when an administrator creates an owner. Existing owner and booking rates are unchanged.</p></div><div><label htmlFor="policies" className="mb-1.5 block text-xs font-semibold text-[#43536a]">Rental policies</label><textarea id="policies" rows={12} value={text} onChange={e => setText(e.target.value)} placeholder="Enter the policies shown to customers..." className="w-full rounded-lg border border-[#dfe5ec] bg-white px-3 py-2.5 text-xs leading-5 text-[#43536a] outline-none focus:border-[#94a9e9]"/></div><div className="flex items-center gap-3"><button disabled={saving} className="h-9 rounded-lg bg-[#2457d6] px-4 text-xs font-semibold text-white disabled:opacity-60">{saving ? "Saving..." : "Save settings"}</button>{message && <p id="default-commission-error" role="alert" className="text-xs text-red-700">{message}</p>}</div></form>;
}
