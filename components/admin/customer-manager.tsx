"use client";

import { runWithAlerts } from "@/lib/alerts/run";
import { toastError } from "@/lib/alerts/toast";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AdminStatus } from "@/components/admin/ui";

export type AdminCustomer = { id: string; full_name: string; phone: string | null; verification: string; customer_archived_at: string | null; verification_rejection_reason: string | null; created_at: string; license_path: string | null; id_path: string | null; license_declared_classes: string[]; license_classes: string[] };

const customerViewClass = "rounded-lg border border-[#dbe4fb] px-3 py-2 text-xs font-semibold text-[#4568bd] aria-pressed:bg-[#2457d6] aria-pressed:text-white";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Manila" }).format(new Date(value));
}

export function CustomerManager({ customers, canReject, canReviewClasses, archiveAvailable, canArchive }: { customers: AdminCustomer[]; canReject: boolean; canReviewClasses: boolean; archiveAvailable: boolean; canArchive: boolean }) {
  const router = useRouter(); const [query, setQuery] = useState(""); const [filter, setFilter] = useState("all"); const [busy, setBusy] = useState(""); const [classDrafts,setClassDrafts]=useState<Record<string,string[]>>({});
  const [showArchived, setShowArchived] = useState(false);

  function setArchived(customer: AdminCustomer, archived: boolean) {
    const name = customer.full_name || "This customer";
    return runWithAlerts({
      confirm: {
        title: archived ? "Archive this customer?" : "Restore this customer?",
        text: archived
          ? `${name} will be unable to make new bookings. Existing bookings and payment history will be kept.`
          : `${name} will return to the current customers list and can book again if eligible.`,
        confirmText: archived ? "Archive customer" : "Restore customer",
        danger: archived,
      },
      setPending: (pending) => setBusy(pending ? customer.id : ""),
      run: async () => {
        const { error } = await createClient().rpc("set_customer_archived", {
          p_customer_id: customer.id, p_archived: archived,
        });
        if (error) throw error;
      },
      success: archived ? "Customer archived" : "Customer restored",
      refresh: router.refresh,
    });
  }

  function switchList(archived: boolean) {
    setShowArchived(archived);
    setFilter("all");
  }

  const shown = useMemo(() => customers.filter(c => Boolean(c.customer_archived_at) === showArchived && `${c.full_name} ${c.phone ?? ""} ${c.id}`.toLowerCase().includes(query.toLowerCase()) && (filter === "all" || c.verification === filter)), [customers, query, filter, showArchived]);
  function classesFor(customer: AdminCustomer) { return classDrafts[customer.id] ?? customer.license_classes ?? []; }
  function toggleClass(customer: AdminCustomer, value: string, checked: boolean) {
    setClassDrafts((current) => { const existing = current[customer.id] ?? customer.license_classes ?? []; return { ...current, [customer.id]: checked ? Array.from(new Set([...existing, value])) : existing.filter((item) => item !== value) }; });
  }
  function saveLicenseClasses(customer: AdminCustomer) {
    const classes = classesFor(customer);
    return runWithAlerts({
      confirm: { title: "Save confirmed license classes?", text: classes.join(", ") || "Clear all confirmed classes.", confirmText: "Save classes" },
      setPending: (pending) => setBusy(pending ? customer.id : ""),
      run: async () => {
        const { error } = await createClient().rpc("admin_set_customer_license_classes", { p_customer: customer.id, p_classes: classes });
        if (error) throw error;
      },
      success: "License classes saved",
      refresh: router.refresh,
    });
  }

  function setVerification(customer: AdminCustomer, status: "approved" | "rejected") {
    const approve = status === "approved";
    return runWithAlerts({
      confirm: approve ? { title: "Approve customer verification?", text: customer.full_name, confirmText: "Approve verification" } : undefined,
      reason: approve ? undefined : { title: "Reject customer verification?", label: "Reason for rejection", confirmText: "Reject verification" },
      setPending: (pending) => setBusy(pending ? customer.id : ""),
      run: async (reason) => {
        const db = createClient();
        const { error } = approve
          ? await db.rpc("admin_set_customer_verification", { customer_uuid: customer.id, next_status: status })
          : await db.rpc("admin_reject_customer_verification", { p_customer_id: customer.id, p_reason: reason });
        if (error) throw error;
      },
      success: approve ? "Customer verification approved" : "Customer verification rejected",
      refresh: router.refresh,
    });
  }

  async function viewDocument(path: string | null) {
    if (!path) return;
    try {
      const { data, error } = await createClient().storage.from("customer-docs").createSignedUrl(path, 60, { download: true });
      if (error) throw error;
      if (!data?.signedUrl) throw new Error("Could not open the document. Please try again.");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      await toastError(error);
    }
  }
  return <div className="space-y-4">
    {archiveAvailable && <div role="group" aria-label="Customer list" className="flex gap-2">
      <button type="button" aria-pressed={!showArchived} onClick={() => switchList(false)} className={customerViewClass}>Current customers</button>
      <button type="button" aria-pressed={showArchived} onClick={() => switchList(true)} className={customerViewClass}>Archived customers</button>
    </div>}
    <div className="flex flex-wrap gap-3"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search customers..." className="h-9 w-full max-w-xs rounded-lg border border-[#dfe5ec] px-3 text-xs outline-none focus:border-[#94a9e9]"/><select value={filter} onChange={e => setFilter(e.target.value)} className="h-9 rounded-lg border border-[#dfe5ec] bg-white px-3 text-xs"><option value="all">All verification</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="none">Not submitted</option></select></div><div className="overflow-x-auto rounded-xl border border-[#e7ecf3] bg-white"><table className="w-full min-w-[800px] text-left text-xs"><thead className="bg-[#f9fafc] text-[9px] uppercase text-[#8d99aa]"><tr>{["Customer", "Joined", "Documents", "License classes", "Verification", "Review"].map(x => <th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody className="divide-y divide-[#f0f2f6]">{shown.map(c => <tr key={c.id} className="text-[#68778c]"><td className="px-4 py-3"><p className="font-semibold text-[#43536a]">{c.full_name || "Unnamed customer"}</p><p>{c.phone || c.id}</p></td><td className="px-4 py-3">{formatDate(c.created_at)}</td><td className="px-4 py-3"><div className="flex gap-2"><button disabled={!c.license_path} onClick={() => viewDocument(c.license_path)} className="text-[#4568bd] disabled:text-gray-400">License</button><button disabled={!c.id_path} onClick={() => viewDocument(c.id_path)} className="text-[#4568bd] disabled:text-gray-400">ID</button></div></td><td className="px-4 py-3">{canReviewClasses ? <><p className="mb-1 text-[10px]">Declared: {(c.license_declared_classes??[]).join(", ")||"None"}</p><p className="mb-2 text-[10px] font-semibold text-[#43536a]">Confirmed: {(c.license_classes??[]).join(", ")||"None"}</p>{(c.license_declared_classes??[]).includes("motorcycle") && !(c.license_classes??[]).includes("motorcycle") && <p className="mb-2 text-[10px] text-amber-800">Customer declared motorcycle use; review the license before confirming.</p>}{["car","motorcycle"].map((value)=><label key={value} className="mr-2 inline-flex items-center gap-1 text-[10px]"><input type="checkbox" disabled={showArchived} checked={classesFor(c).includes(value)} onChange={(e)=>toggleClass(c,value,e.target.checked)}/>{value}</label>)}<button disabled={showArchived || busy===c.id} onClick={()=>saveLicenseClasses(c)} className="mt-2 block rounded bg-[#edf2ff] px-2 py-1 text-[10px] text-[#4568bd]">Save classes</button></> : <span>Unavailable</span>}</td><td className="px-4 py-3"><AdminStatus status={c.verification}/>{c.verification === "rejected" && c.verification_rejection_reason && <p className="mt-1 whitespace-pre-wrap break-words">{c.verification_rejection_reason}</p>}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-2">{showArchived ? <>
        {c.customer_archived_at && <span className="w-full text-[10px]">Archived {formatDate(c.customer_archived_at)}</span>}
        {canArchive && <button type="button" disabled={!!busy} onClick={() => setArchived(c, false)} className="rounded-md border border-[#dbe4fb] px-2 py-1 text-[10px] font-semibold text-[#4568bd] disabled:opacity-40">Restore customer</button>}
      </> : <><button disabled={busy === c.id || c.verification === "approved" || !c.license_path || !c.id_path} onClick={() => setVerification(c,"approved")} className="rounded-md bg-[#edf7f1] px-2 py-1 text-[10px] text-[#347f59] disabled:opacity-40">Approve</button><button disabled={!canReject || busy === c.id || c.verification === "rejected"} onClick={() => setVerification(c,"rejected")} className="rounded-md bg-[#fff0f0] px-2 py-1 text-[10px] text-[#a94a4a] disabled:opacity-40">Reject</button>
      {canArchive && <button type="button" disabled={!!busy} onClick={() => setArchived(c, true)} className="rounded-md border border-red-200 px-2 py-1 text-[10px] font-semibold text-red-700 disabled:opacity-40">Archive customer</button>}
      </>}</div></td></tr>)}</tbody></table>{!shown.length && <p className="p-8 text-center text-xs text-[#8793a3]">No customers match this filter.</p>}</div></div>;
}
