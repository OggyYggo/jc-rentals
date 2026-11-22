"use client";

import { useAutoAnimate } from "@formkit/auto-animate/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { runWithAlerts } from "@/lib/alerts/run";
import { paymentDate, paymentPeso } from "@/lib/payment-format";
import { paymentImage } from "@/lib/payment-image";
import { createClient } from "@/lib/supabase/client";
import { PaymentQueueBadge, PaymentQueueCard, PaymentQueueEmpty } from "./payment-queue-card";

export type RefundRow = {
  id: string;
  booking_id: string;
  amount: number;
  due_at: string;
  status: string;
  refund_proof_path: string | null;
  booking: { reference: string } | null;
};

export function RefundQueue({ refunds, userId, admin = false }: { refunds: RefundRow[]; userId: string; admin?: boolean }) {
  const router = useRouter();
  const [listRef] = useAutoAnimate<HTMLElement>({ duration: 180 });
  const [busy, setBusy] = useState(false);

  function recordRefund(refund: RefundRow, form: FormData) {
    return runWithAlerts({
      confirm: { title: "Record this refund?", text: `Confirm the ${paymentPeso(refund.amount)} refund has been sent.`, confirmText: "Mark refunded" },
      setPending: setBusy,
      run: async () => {
        const image = await paymentImage(form.get("proof") as File);
        const reference = String(form.get("reference") ?? "").trim();
        if (!reference) throw new Error("Enter the refund reference.");
        const db = createClient();
        const path = `${userId}/${refund.booking_id}/${crypto.randomUUID()}.webp`;
        const bucket = db.storage.from("refund-proofs");
        const { error: uploadError } = await bucket.upload(path, image, { contentType: image.type });
        if (uploadError) throw uploadError;
        const { error } = await db.rpc("mark_booking_refunded", { p_booking_id: refund.booking_id, p_reference: reference, p_proof_path: path });
        if (error) throw error;
      },
      success: "Refund recorded",
      refresh: router.refresh,
    });
  }

  function waive(bookingId: string) {
    return runWithAlerts({
      reason: { title: "Waive this refund?", label: "Audit reason", confirmText: "Mark refund waived" },
      run: async (reason) => {
        const { error } = await createClient().rpc("admin_waive_booking_refund", { p_booking_id: bookingId, p_reason: reason });
        if (error) throw error;
      },
      success: "Refund waived",
      refresh: router.refresh,
      setPending: setBusy,
    });
  }

  function viewProof(path: string) {
    return runWithAlerts({
      run: async () => {
        const { data, error } = await createClient().storage.from("refund-proofs").createSignedUrl(path, 120);
        if (error) throw error;
        window.location.assign(data.signedUrl);
      },
    });
  }

  if (!refunds.length) return admin ? <p className="rounded-xl border bg-white p-5 text-sm">No refunds in this queue.</p>
    : <PaymentQueueEmpty>No refunds in this queue.</PaymentQueueEmpty>;
  return <section ref={listRef} id="refunds" className="space-y-3">
    {refunds.map((refund) => {
      const actionable = refund.status === "owed" || refund.status === "disputed";
      const proofPath = refund.refund_proof_path;
      const bookingRef = refund.booking?.reference ?? refund.booking_id;
      const amount = paymentPeso(refund.amount);
      const due = `Due ${paymentDate(refund.due_at)} Manila time`;
      const proof = proofPath && <button type="button" className={admin ? "mt-2 min-h-11 text-blue-700 underline" : "min-h-11 font-semibold text-blue-800 underline underline-offset-2"} onClick={() => viewProof(proofPath)}>View refund proof</button>;
      const form = actionable && <form onSubmit={event => {
        event.preventDefault();
        if (!busy) void recordRefund(refund, new FormData(event.currentTarget));
      }} className={admin ? "grid gap-2 sm:grid-cols-2" : "grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end"}>
        <label className={admin ? undefined : "min-w-0 text-sm font-medium text-[#405775]"}>Refund reference<input name="reference" required maxLength={80} className={admin ? "mt-1 w-full rounded border p-2" : "mt-1 min-h-11 w-full rounded-lg border border-[#dce5f1] px-3 text-base lg:text-sm"} /></label>
        <label className={admin ? undefined : "min-w-0 text-sm font-medium text-[#405775]"}>Transfer screenshot<input name="proof" required type="file" accept="image/jpeg,image/png,image/webp" className={admin ? "mt-1 w-full rounded border p-2" : "mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-[#dce5f1] p-1.5 text-sm file:mr-2 file:rounded file:bg-blue-50 file:px-2 file:py-1 file:text-blue-900"} /></label>
        <button disabled={busy} className={admin ? "w-fit rounded-lg bg-emerald-700 px-4 py-3 text-white disabled:opacity-50" : "min-h-11 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-50 sm:justify-self-start"}>Mark refunded</button>
      </form>;
      if (admin) return <article key={refund.id} className="rounded-xl border bg-white p-5 text-sm">
        <h2 className="font-semibold">{bookingRef} · {amount}</h2>
        <p className="mt-1 capitalize">{refund.status} · {due}</p>
        {proof}
        {actionable && <div className="mt-3">{form}<button type="button" disabled={busy} onClick={() => waive(refund.booking_id)} className="mt-2 min-h-11 text-red-800 underline">Mark refund waived</button></div>}
      </article>;

      const label = refund.status === "owed" ? "To send" : refund.status.charAt(0).toUpperCase() + refund.status.slice(1);
      return <PaymentQueueCard key={refund.id} title={bookingRef} amount={amount}
        badge={<PaymentQueueBadge label={label} tone={actionable ? "amber" : refund.status === "refunded" ? "green" : "neutral"} />}
        detail={actionable ? <span>{due}</span> : null}
        action={actionable ? "Record refund" : "View refund details"}>
        {proof}
        {form}
        {!actionable && !proof && <p className="text-sm text-[#51647f]">No transfer screenshot is attached.</p>}
      </PaymentQueueCard>;
    })}
  </section>;
}
