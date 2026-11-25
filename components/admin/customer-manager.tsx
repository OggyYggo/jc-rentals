"use client";

import { EntityHistory } from "@/components/admin/audit/EntityHistory";
import { CustomerReviewDialog } from "@/components/admin/customer-review-dialog";
import type { DocumentKind } from "@/components/admin/DocumentViewer";

import { runWithAlerts } from "@/lib/alerts/run";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { AdminFilterChips, AdminStatus, mobileAction } from "@/components/admin/ui";

export type AdminCustomer = { bookingCount?: number; selfie?: { revision: string; status: string }; id: string; full_name: string; phone: string | null; verification: string; customer_archived_at: string | null; verification_rejection_reason: string | null; created_at: string; license_path: string | null; id_path: string | null; license_declared_classes: string[]; license_classes: string[] };

const customerViewClass = "rounded-lg border border-[#dbe4fb] px-3 py-2 text-xs font-semibold text-[#4568bd] aria-pressed:bg-[#2457d6] aria-pressed:text-white";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Manila" }).format(new Date(value));
}

export function CustomerManager({ initialFilter = "all", customers, canReject, canReviewClasses, archiveAvailable, canArchive }: { initialFilter?: string; customers: AdminCustomer[]; canReject: boolean; canReviewClasses: boolean; archiveAvailable: boolean; canArchive: boolean }) {
  const router = useRouter(); const [query, setQuery] = useState(""); const [filter, setFilter] = useState(initialFilter); const [busy, setBusy] = useState(""); const [classDrafts,setClassDrafts]=useState<Record<string,string[]>>({});
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

  const matching = useMemo(() => customers.filter(c => Boolean(c.customer_archived_at) === showArchived && `${c.full_name} ${c.phone ?? ""} ${c.id}`.toLowerCase().includes(query.toLowerCase())), [customers, query, showArchived]);
  const shown = matching.filter(c => filter === "all" || c.verification === filter);
  const verificationOptions = [["all", "All"], ["pending", "To verify"], ["approved", "Verified"], ["rejected", "Rejected"], ["none", "Not submitted"]];
  const searchInput = useRef<HTMLInputElement>(null);
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

  const [dialog, setDialog] = useState<{ id: string; kind: DocumentKind; review: boolean } | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const selected = dialog ? customers.find(customer => customer.id === dialog.id) : undefined;
  const openDialog = (button: HTMLButtonElement, customer: AdminCustomer, kind: DocumentKind, review: boolean) => {
    trigger.current = button;
    setDialog({ id: customer.id, kind, review });
  };

  function licenseControls(c: AdminCustomer) {
    return <>{canReviewClasses ? <><p className="mb-1 text-[10px]">Declared: {(c.license_declared_classes??[]).join(", ")||"None"}</p><p className="mb-2 text-[10px] font-semibold text-[#43536a]">Confirmed: {(c.license_classes??[]).join(", ")||"None"}</p>{(c.license_declared_classes??[]).includes("motorcycle") && !(c.license_classes??[]).includes("motorcycle") && <p className="mb-2 text-[10px] text-amber-800">Customer declared motorcycle use; review the license before confirming.</p>}{["car","motorcycle"].map((value)=><label key={value} className="mr-2 inline-flex items-center gap-1 text-[10px]"><input type="checkbox" disabled={showArchived} checked={classesFor(c).includes(value)} onChange={(e)=>toggleClass(c,value,e.target.checked)}/>{value}</label>)}<button disabled={showArchived || busy===c.id} onClick={()=>saveLicenseClasses(c)} className="mt-2 block rounded bg-[#edf2ff] px-2 py-1 text-[10px] text-[#4568bd]">Save classes</button></> : <span>Unavailable</span>}</>;
  }

  return <div className="space-y-4">
    {archiveAvailable && <div role="group" aria-label="Customer list" className="flex gap-2">
      <button type="button" aria-pressed={!showArchived} onClick={() => switchList(false)} className={customerViewClass}>Current customers</button>
      <button type="button" aria-pressed={showArchived} onClick={() => switchList(true)} className={customerViewClass}>Archived customers</button>
    </div>}
    <div className="flex flex-wrap gap-3"><input ref={searchInput} aria-label="Search customers" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search customers..." className="h-9 w-full max-w-xs rounded-lg border border-[#dfe5ec] px-3 text-xs outline-none focus:border-[#94a9e9]"/><select id="customer-verification-filter" aria-label="Verification status" value={filter} onChange={e => setFilter(e.target.value)} className="h-9 rounded-lg border border-[#dfe5ec] bg-white px-3 text-xs max-lg:hidden"><option value="all">All verification</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="none">Not submitted</option></select></div><div className="lg:hidden"><AdminFilterChips label="Verification status" value={filter} onChange={setFilter} options={verificationOptions.map(([value, label]) => ({ value, label, count: matching.filter(customer => value === "all" || customer.verification === value).length }))}/></div><div className="admin-card-table overflow-x-auto rounded-xl border border-[#e7ecf3] bg-white"><table className="w-full min-w-[800px] text-left text-xs"><thead className="bg-[#f9fafc] text-[9px] uppercase text-[#8d99aa]"><tr>{["Customer", "Joined", "Documents", "License classes", "Verification", "Review"].map(x => <th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody className="divide-y divide-[#f0f2f6]">{shown.map(c => <tr id={`record-${c.id}`} key={c.id} className="text-[#68778c]"><td className="px-4 py-3"><div className="flex flex-wrap items-center justify-between gap-2 lg:block"><p className="font-semibold text-[#43536a]">{c.full_name || "Unnamed customer"}</p><span className="lg:hidden"><AdminStatus status={c.verification}/></span></div><p>{c.phone || c.id}</p>{c.bookingCount !== undefined && <p className="lg:hidden">{c.bookingCount} bookings</p>}<div className="hidden lg:contents"><EntityHistory entity="customer" id={c.id}/></div></td><td className="px-4 py-3 max-lg:hidden!">{formatDate(c.created_at)}</td><td className="px-4 py-3"><div className="admin-document-chips flex flex-wrap gap-2 lg:flex-nowrap">{c.license_path ? <button type="button" className="min-h-9 text-blue-800 underline" onClick={event => openDialog(event.currentTarget, c, "license", false)}>License</button> : <span className="self-center">No license</span>}
      {c.id_path ? <button type="button" className="min-h-9 text-blue-800 underline" onClick={event => openDialog(event.currentTarget, c, "id", false)}>ID</button> : <span className="self-center">No ID</span>}{c.selfie && <button type="button" className="min-h-9 text-blue-800 underline" onClick={event => openDialog(event.currentTarget, c, "selfie", false)}>Selfie · {c.selfie.status === "pending" ? "Review" : c.selfie.status}</button>}</div></td><td className="px-4 py-3 max-lg:hidden!">{licenseControls(c)}</td><td className="px-4 py-3"><span className="hidden lg:inline"><AdminStatus status={c.verification}/></span>{c.verification === "rejected" && c.verification_rejection_reason && <p className="mt-1 whitespace-pre-wrap break-words">{c.verification_rejection_reason}</p>}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-2">{showArchived ? <>
        {c.customer_archived_at && <span className="w-full text-[10px]">Archived {formatDate(c.customer_archived_at)}</span>}
        {canArchive && <button type="button" disabled={!!busy} onClick={() => setArchived(c, false)} className="rounded-md border border-[#dbe4fb] px-2 py-1 text-[10px] font-semibold text-[#4568bd] disabled:opacity-40">Restore customer</button>}
      </> : <>{c.license_path || c.id_path || c.verification === "pending" ? <button type="button"
        onClick={event => openDialog(event.currentTarget, c, c.license_path || !c.id_path ? "license" : "id", true)}
        className="min-h-9 rounded-lg bg-blue-700 px-3 text-sm font-semibold text-white focus-visible:ring-2 focus-visible:ring-blue-600"><span className="lg:hidden">Review documents</span><span className="hidden lg:inline">Review</span></button>
        : <span className="self-center">No documents</span>}
      {canArchive && <button type="button" disabled={!!busy} onClick={() => setArchived(c, true)} className="rounded-md border border-red-200 px-2 py-1 text-[10px] font-semibold text-red-700 disabled:opacity-40">Archive customer</button>}
      </>}<Link className={mobileAction + " lg:hidden!"} href={`/admin/bookings?customer=${c.id}`}>Bookings</Link></div>
      <details className="mt-2 border-t border-[#E3EEF9] lg:hidden"><summary className="flex min-h-11 cursor-pointer items-center font-semibold text-[#0A47B1]">Customer details</summary><p className="mb-2">Joined {formatDate(c.created_at)}</p>{licenseControls(c)}<EntityHistory entity="customer" id={c.id}/></details></td></tr>)}</tbody></table>{!shown.length && <p className="p-8 text-center text-xs text-[#8793a3]">No customers match this filter.</p>}</div>
      {dialog && selected && <CustomerReviewDialog key={selected.id} customer={selected} joined={formatDate(selected.created_at)}
        initialKind={dialog.kind} review={dialog.review} canReject={canReject} returnFocus={trigger}
        onClose={decided => {
          setDialog(null);
          requestAnimationFrame(() => (trigger.current?.isConnected && !(decided && filter !== "all") ? trigger.current : (window.matchMedia("(width < 64rem)").matches ? searchInput.current : document.getElementById("customer-verification-filter")))?.focus());
        }} />}
    </div>;
}
