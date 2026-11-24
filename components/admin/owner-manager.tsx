"use client";

import { runWithAlerts } from "@/lib/alerts/run";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { FormEvent } from "react";
import { LoaderCircle, Plus, Search, Store } from "lucide-react";
import { AdminStatus, adminInputClass } from "@/components/admin/ui";
import { createClient } from "@/lib/supabase/client";

export type CustomerOption = { id: string; full_name: string; phone: string | null };
export type OwnerRow = { id: string; profile_id: string; business_name: string; contact_phone: string | null; commission_rate: number; is_active: boolean; archived_at: string | null; active_before_archive: boolean | null; payment_options: { is_active: boolean; verified: boolean }[]; profile: { full_name: string; phone: string | null } | null };

const ownerViewClass = "rounded-lg border border-[#dbe4fb] px-3 py-2 text-xs font-semibold text-[#4568bd] aria-pressed:bg-[#2457d6] aria-pressed:text-white";

export function OwnerManager({ owners, customers, defaultCommission, canArchive }: { owners: OwnerRow[]; customers: CustomerOption[]; defaultCommission: number; canArchive: boolean }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [commissionRate, setCommissionRate] = useState(String(defaultCommission));
  const [drafts, setDrafts] = useState<Record<string, { business_name: string; contact_phone: string; commission_rate: string }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const filtered = useMemo(() => owners.filter((owner) => Boolean(owner.archived_at) === showArchived && `${owner.business_name} ${owner.profile?.full_name ?? ""}`.toLowerCase().includes(search.toLowerCase())), [owners, search, showArchived]);

  function addOwner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    return runWithAlerts({
      setPending: (pending) => setBusyId(pending ? "new" : null),
      run: async () => {
        const { error } = await createClient().rpc("admin_create_owner", {
          customer_uuid: customerId, new_business_name: businessName.trim(),
          new_commission_rate: commissionRate === "" ? null : Number(commissionRate),
        });
        if (error) throw error;
        setCreating(false);
        setCustomerId("");
        setBusinessName("");
      },
      success: "Owner created",
      refresh: router.refresh,
    });
  }

  function draftFor(owner: OwnerRow) {
    return drafts[owner.id] ?? { business_name: owner.business_name, contact_phone: owner.contact_phone ?? "", commission_rate: String(Number(owner.commission_rate)) };
  }

  function saveOwner(owner: OwnerRow) {
    const draft = draftFor(owner);
    const rate = Number(draft.commission_rate);
    const percent = new Intl.NumberFormat("en-PH", { style: "percent", maximumFractionDigits: 2 });
    return runWithAlerts({
      confirm: rate !== Number(owner.commission_rate) ? {
        title: "Change this owner's commission?",
        text: `Commission ${percent.format(Number(owner.commission_rate))} → ${percent.format(rate)}. Applies to new bookings only.`,
        confirmText: "Save commission",
      } : undefined,
      setPending: (pending) => setBusyId(pending ? owner.id : null),
      run: async () => {
        const { error } = await createClient().from("owners").update({
          business_name: draft.business_name.trim(), contact_phone: draft.contact_phone.trim() || null, commission_rate: rate,
        }).eq("id", owner.id);
        if (error) throw error;
      },
      success: "Owner details saved",
      refresh: router.refresh,
    });
  }

  function toggleOwner(owner: OwnerRow) {
    return runWithAlerts({
      confirm: {
        title: owner.is_active ? "Deactivate this owner?" : "Reactivate this owner?",
        text: owner.is_active ? `${owner.business_name}’s vehicles will disappear from customer search.` : owner.business_name,
        confirmText: owner.is_active ? "Deactivate owner" : "Reactivate owner",
        danger: owner.is_active,
      },
      setPending: (pending) => setBusyId(pending ? owner.id : null),
      run: async () => {
        const { error } = await createClient().rpc("admin_set_owner_active", { p_owner_id: owner.id, p_is_active: !owner.is_active });
        if (error) throw error;
      },
      success: owner.is_active ? "Owner deactivated" : "Owner reactivated",
      refresh: router.refresh,
    });
  }

  function setArchived(owner: OwnerRow, archived: boolean) {
    return runWithAlerts({
      confirm: {
        title: archived ? "Archive this owner?" : "Restore this owner?",
        text: archived
          ? `${owner.business_name} will lose dashboard access and its vehicles will disappear from public search. Existing bookings, vehicles, and payment records will be kept.`
          : `${owner.business_name} will return to the owners list as ${owner.active_before_archive ? "active" : "inactive"}.`,
        confirmText: archived ? "Archive owner" : "Restore owner",
        danger: archived,
      },
      setPending: (pending) => setBusyId(pending ? owner.id : null),
      run: async () => {
        const { error } = await createClient().rpc("set_owner_archived", { p_owner_id: owner.id, p_archived: archived });
        if (error) throw error;
      },
      success: archived ? "Owner archived" : "Owner restored",
      refresh: router.refresh,
    });
  }

  return <div className="space-y-4">
    <div role="group" aria-label="Owner list" className="flex gap-2">
      <button type="button" aria-pressed={!showArchived} onClick={() => setShowArchived(false)} className={ownerViewClass}>Current owners</button>
      <button type="button" aria-pressed={showArchived} onClick={() => { setShowArchived(true); setCreating(false); }} className={ownerViewClass}>Archived owners</button>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="relative w-full max-w-xs"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b97a8]"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search owners..." className={`${adminInputClass} pl-9`}/></div>{!showArchived && <button onClick={() => { setCreating((value) => !value); }} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#2457d6] px-3.5 text-[11px] font-semibold text-white hover:bg-[#1d4ed8]"><Plus size={14}/>Add owner</button>}</div>
    {creating && <form onSubmit={addOwner} className="rounded-xl border border-[#e2e8f0] bg-white p-4 shadow-sm sm:p-5"><div className="mb-4"><h2 className="text-sm font-semibold text-[#33445b]">Create owner account</h2><p className="mt-1 text-[10px] text-[#8793a3]">Promote an existing customer and create their business workspace.</p></div><div className="grid gap-3 sm:grid-cols-3"><label className="text-[10px] font-medium text-[#69788e]">Customer profile<select required value={customerId} onChange={(event) => setCustomerId(event.target.value)} className={`${adminInputClass} mt-1.5`}><option value="">Choose a customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.full_name || customer.phone || customer.id.slice(0, 8)} · {customer.phone || "No phone"}</option>)}</select></label><label className="text-[10px] font-medium text-[#69788e]">Business name<input required value={businessName} onChange={(event) => setBusinessName(event.target.value)} className={`${adminInputClass} mt-1.5`} placeholder="Business name"/></label><label className="text-[10px] font-medium text-[#69788e]">Commission rate (%)<input required type="number" min="0" max="100" step="0.1" value={Number(commissionRate) * 100} onChange={(event) => setCommissionRate(String(Number(event.target.value) / 100))} className={`${adminInputClass} mt-1.5`}/></label></div>{!customers.length && <p className="mt-3 text-[10px] text-[#9a6c2b]">No customer profiles are available to promote yet.</p>}<div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setCreating(false)} className="h-8 rounded-lg border border-[#e1e7ef] px-3 text-[10px] font-medium text-[#68778c]">Cancel</button><button disabled={!customers.length || busyId === "new"} className="inline-flex h-8 items-center gap-2 rounded-lg bg-[#2457d6] px-3 text-[10px] font-semibold text-white disabled:opacity-50">{busyId === "new" && <LoaderCircle size={13} className="animate-spin"/>}Create owner</button></div></form>}
    {showArchived ? (
      filtered.length ? <ul className="space-y-2">
        {filtered.map((owner) => <li key={owner.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e7ecf3] bg-white p-4">
          <div>
            <h2 className="text-sm font-semibold text-[#43536a]">{owner.business_name}</h2>
            <p className="mt-1 text-xs text-[#68778c]">Archived {new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }).format(new Date(owner.archived_at!))}</p>
          </div>
          {canArchive && <button type="button" disabled={busyId !== null} onClick={() => setArchived(owner, false)} className="rounded-lg border border-[#dbe4fb] px-3 py-2 text-xs font-semibold text-[#4568bd] disabled:opacity-50">{busyId === owner.id ? "Restoring…" : "Restore owner"}</button>}
        </li>)}
      </ul> : <p className="rounded-xl border border-[#e7ecf3] bg-white p-8 text-center text-sm text-[#68778c]">No archived owners match.</p>
    ) : filtered.length ? <div className="overflow-x-auto rounded-xl border border-[#e7ecf3] bg-white shadow-[0_2px_6px_rgba(20,42,78,.025)]"><table className="w-full min-w-[1100px] text-left"><thead className="bg-[#f9fafc] text-[9px] font-medium uppercase tracking-wide text-[#8d99aa]"><tr><th className="px-4 py-3">Business / account</th><th className="px-3 py-3">Contact phone</th><th className="px-3 py-3">Commission</th><th className="px-3 py-3">Access</th><th className="px-3 py-3">Payment options</th><th className="px-3 py-3">Update</th></tr></thead><tbody className="divide-y divide-[#f0f2f6]">{filtered.map((owner) => { const draft = draftFor(owner); return <tr key={owner.id} className="align-middle"><td className="px-4 py-3.5"><div className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#edf2ff] text-[#4c6fc9]"><Store size={15}/></span><div><input aria-label="Business name" value={draft.business_name} onChange={(event) => setDrafts((current) => ({ ...current, [owner.id]: { ...draft, business_name: event.target.value } }))} className="w-48 border-0 bg-transparent text-[11px] font-semibold text-[#43536a] outline-none focus:underline"/><p className="mt-0.5 text-[9px] text-[#8b97a8]">{owner.profile?.full_name || "Owner"} · {owner.profile_id.slice(0, 8)}</p></div></div></td><td className="px-3 py-3.5"><input aria-label="Contact phone" value={draft.contact_phone} onChange={(event) => setDrafts((current) => ({ ...current, [owner.id]: { ...draft, contact_phone: event.target.value } }))} placeholder="Phone" className="h-8 w-32 rounded-md border border-[#e3e8ef] px-2 text-[10px] text-[#56657b]"/></td><td className="px-3 py-3.5"><div className="flex items-center gap-1"><input aria-label="Commission rate percent" type="number" min="0" max="100" step="0.1" value={Number(draft.commission_rate) * 100} onChange={(event) => setDrafts((current) => ({ ...current, [owner.id]: { ...draft, commission_rate: String(Number(event.target.value) / 100) } }))} className="h-8 w-16 rounded-md border border-[#e3e8ef] px-2 text-[10px] text-[#56657b]"/><span className="text-[10px] text-[#8793a3]">%</span></div></td><td className="px-3 py-3.5"><div className="flex items-center gap-2"><AdminStatus status={owner.is_active ? "active" : "inactive"}/><button disabled={busyId === owner.id} onClick={() => toggleOwner(owner)} className="text-[9px] font-semibold text-[#4e6fc4]">{owner.is_active ? "Deactivate" : "Activate"}</button></div></td><td className="px-3 py-3.5"><div className="flex flex-col items-start gap-1"><span className="text-xs font-medium">{owner.payment_options.filter(option => option.is_active && option.verified).length} verified options</span><Link href={`/admin/owners/${owner.id}`} className="text-[9px] font-semibold text-[#4e6fc4] hover:underline">Review payment</Link></div></td><td className="px-3 py-3.5"><button disabled={busyId === owner.id} onClick={() => saveOwner(owner)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#dbe4fb] bg-[#f7f9ff] px-2.5 text-[10px] font-semibold text-[#4568bd] disabled:opacity-50">{busyId === owner.id && <LoaderCircle size={12} className="animate-spin"/>}Save</button>{canArchive && <button type="button" disabled={busyId !== null} onClick={() => setArchived(owner, true)} className="ml-2 rounded-lg border border-red-200 px-2.5 py-2 text-[10px] font-semibold text-red-700 disabled:opacity-50">Archive owner</button>}</td></tr>; })}</tbody></table></div> : <div className="rounded-xl border border-[#e7ecf3] bg-white px-6 py-14 text-center"><Store size={22} className="mx-auto text-[#94a1b2]"/><h2 className="mt-3 text-sm font-semibold text-[#43536a]">No owners found</h2><p className="mt-1 text-xs text-[#8793a3]">Add an owner or adjust your search.</p></div>}
  </div>;
}
