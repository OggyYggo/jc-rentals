"use client";

import { useAutoAnimate } from "@formkit/auto-animate/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { runWithAlerts } from "@/lib/alerts/run";
import { paymentDate, paymentPeso } from "@/lib/payment-format";
import { paymentImage } from "@/lib/payment-image";
import { createClient } from "@/lib/supabase/client";

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

  if (!refunds.length) return <p className="rounded-xl border bg-white p-5 text-sm">No refunds in this queue.</p>;
  return <section ref={listRef} id="refunds" className="space-y-3">
    {refunds.map((refund) => {
      const actionable = refund.status === "owed" || refund.status === "disputed";
      const proofPath = refund.refund_proof_path;
      return <article key={refund.id} className="rounded-xl border bg-white p-5 text-sm">
        <h2 className="font-semibold">{refund.booking?.reference ?? refund.booking_id} · {paymentPeso(refund.amount)}</h2>
        <p className="mt-1 capitalize">{refund.status} · Due {paymentDate(refund.due_at)} Manila time</p>
        {proofPath && <button className="mt-2 min-h-11 text-blue-700 underline" onClick={() => viewProof(proofPath)}>View refund proof</button>}
        {actionable && <>
          <form onSubmit={(event) => {
            event.preventDefault();
            if (!busy) void recordRefund(refund, new FormData(event.currentTarget));
          }} className="mt-3 grid gap-2 sm:grid-cols-2">
            <label>Refund reference<input name="reference" required maxLength={80} className="mt-1 w-full rounded border p-2" /></label>
            <label>Transfer screenshot<input name="proof" required type="file" accept="image/jpeg,image/png,image/webp" className="mt-1 w-full rounded border p-2" /></label>
            <button disabled={busy} className="w-fit rounded-lg bg-emerald-700 px-4 py-3 text-white disabled:opacity-50">Mark refunded</button>
          </form>
          {admin && <button disabled={busy} onClick={() => waive(refund.booking_id)} className="mt-2 min-h-11 text-red-800 underline">Mark refund waived</button>}
        </>}
      </article>;
    })}
  </section>;
}
