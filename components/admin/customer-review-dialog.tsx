"use client";

import { useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogPanel } from "@/components/ui/dialog";
import { DocumentViewer, documentLabels, type DocumentKind } from "@/components/admin/DocumentViewer";
import { Spinner } from "@/components/loading/Spinner";
import { friendlyError } from "@/lib/alerts/errors";
import { toastSuccess } from "@/lib/alerts/toast";
import { createClient } from "@/lib/supabase/client";
import type { AdminCustomer } from "./customer-manager";

const control = "min-h-10 rounded-lg border px-3 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-50";

export function CustomerReviewDialog({ customer, joined, initialKind, review, canReject, onClose, returnFocus }: {
  customer: AdminCustomer; joined: string; initialKind: DocumentKind; review: boolean; canReject: boolean; onClose: (decided?: boolean) => void;
  returnFocus: RefObject<HTMLButtonElement | null>;
}) {
  const router = useRouter();
  const [kind, setKind] = useState(initialKind);
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const missing = [!customer.license_path && "License not uploaded", !customer.id_path && "ID not uploaded"].filter(Boolean);
  const selfie = kind === "selfie" ? customer.selfie : undefined;
  const hasDocument = kind === "license" ? Boolean(customer.license_path) : kind === "id" ? Boolean(customer.id_path) : Boolean(selfie);

  async function decideSelfie(approved: boolean) {
    if (!selfie || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const { error } = await createClient().rpc("admin_review_customer_selfie", {
        p_customer: customer.id, p_revision: selfie.revision, p_approved: approved,
      });
      if (error) throw error;
      router.refresh();
      onClose();
      void toastSuccess(approved ? "Selfie approved" : "Selfie marked for replacement");
    } catch {
      setError("Could not save this decision. Reload the customer record and try again.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function decide(status: "approved" | "rejected") {
    if (submitting.current) return;
    const note = reason.trim();
    if (status === "rejected" && (Array.from(note).length < 5 || Array.from(note).length > 300)) {
      setError("Enter a reason of 5 to 300 characters.");
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const { error } = await createClient().rpc("admin_set_customer_verification", {
        customer_uuid: customer.id, next_status: status, p_note: status === "rejected" ? note : null,
      });
      if (error) throw error;
      router.refresh();
      onClose(true);
      void toastSuccess(status === "approved" ? "Customer verification approved" : "Customer verification rejected");
    } catch (error) {
      setError(friendlyError(error).text);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return <Dialog.Root open onOpenChange={open => { if (!open && !submitting.current) onClose(); }}>
    <DialogPanel className="max-w-3xl" finalFocus={returnFocus}>
      <Dialog.Title className="text-lg font-semibold">{review ? "Review customer verification" : documentLabels[kind]}</Dialog.Title>
      <Dialog.Description className="mt-1 text-sm">{customer.full_name || "Unnamed customer"} · {customer.phone || "No phone"} · Joined {joined}</Dialog.Description>
      {review && <div className="my-3 flex flex-wrap gap-2" role="group" aria-label="Customer documents">
        {(["license", "id"] as const).map(item => <button key={item} type="button" aria-pressed={kind === item} className={`${control} aria-pressed:bg-blue-50`}
          onClick={() => setKind(item)}>{documentLabels[item]}</button>)}
      </div>}
      <div className="mt-3">
        {hasDocument ? <DocumentViewer customerId={customer.id} kind={kind} revision={selfie?.revision} />
          : <p className="rounded-lg bg-slate-100 p-3 text-sm">{documentLabels[kind]} not uploaded.</p>}
      </div>
      {selfie?.status === "pending" && <div className="mt-4 space-y-3 border-t pt-4">
        <p className="text-sm">Check that the customer is holding the same ID they submitted.</p>
        {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} className={`${control} bg-emerald-50 text-emerald-950`} onClick={() => void decideSelfie(true)}>Approve selfie</button>
          <button type="button" disabled={busy} className={`${control} text-red-900`} onClick={() => void decideSelfie(false)}>Request replacement</button>
        </div>
      </div>}
      {review && <div className="mt-4 space-y-3 border-t pt-4">
        <p className="text-sm">Check that the name matches the ID, the license is current, and the photo is clear.</p>
        {missing.length > 0 && <p className="text-sm text-amber-900">{missing.join(" · ")}</p>}
        {customer.verification === "approved" && <p className="text-sm text-slate-600">This customer is already approved.</p>}
        {customer.verification === "rejected" && <p className="break-words text-sm text-slate-600">Already rejected{customer.verification_rejection_reason && ` · ${customer.verification_rejection_reason}`}</p>}
        {!canReject && <p className="text-sm text-slate-600">Rejection is unavailable until the verification migration is applied.</p>}
        {rejecting && <label className="block text-sm font-semibold">Reason shown to the customer
          <textarea autoFocus value={reason} onChange={event => setReason(event.target.value)} maxLength={300} rows={3} className="mt-1 block w-full rounded-lg border p-2 font-normal" />
        </label>}
        {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy || Boolean(missing.length) || customer.verification === "approved"} className={`${control} bg-emerald-50 text-emerald-950`} onClick={() => void decide("approved")}>Approve</button>
          <button type="button" disabled={busy || !canReject || customer.verification === "rejected"} className={`${control} text-red-900`} onClick={() => {
            if (rejecting) void decide("rejected");
            else { setError(""); setRejecting(true); }
          }}>{rejecting ? "Reject with reason" : "Reject"}</button>
          {busy && <p role="status" className="inline-flex items-center gap-2 text-sm"><Spinner className="size-4" /> Saving decision…</p>}
        </div>
      </div>}
      <Dialog.Close disabled={busy} className={`mt-4 ${control}`}>Close</Dialog.Close>
    </DialogPanel>
  </Dialog.Root>;
}
