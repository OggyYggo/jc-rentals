"use client";

import { runWithAlerts } from "@/lib/alerts/run";
import { normalizePaymentReference, paymentDate, paymentPeso } from "@/lib/payment-format";
import { createClient } from "@/lib/supabase/client";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Payment = {
  id: string; booking_id: string; amount: number; reference_no: string; proof_path: string; paid_at: string;
  proof_sha256: string | null; flags: string[];
  booking: { reference: string; review_due_at: string | null; payment_flags: string[]; car: { brand: string; model: string } | null } | null;
};

export function OwnerPaymentReview({ payments, admin = false }: { payments: Payment[]; admin?: boolean }) {
  const router = useRouter();
  const [listRef] = useAutoAnimate<HTMLDivElement>({ duration: 180 });
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [inputs, setInputs] = useState<Record<string, { amount: string; reference: string }>>({});
  const [busy, setBusy] = useState("");
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const db = createClient();
    for (const payment of payments) {
      void db.storage.from("payment-proofs").createSignedUrl(payment.proof_path, 300).then(({ data }) => {
        if (active && data?.signedUrl) setUrls((current) => ({ ...current, [payment.id]: data.signedUrl }));
      });
    }
    return () => { active = false; };
  }, [payments, router]);

  function review(payment: Payment, approve: boolean) {
    return runWithAlerts({
      confirm: approve ? {
        title: admin ? "Confirm on behalf of the owner?" : "Confirm this payment?",
        text: `Record the ${paymentPeso(payment.amount)} reservation payment for ${payment.booking?.reference ?? "this booking"}.`,
        confirmText: "Confirm payment",
      } : undefined,
      reason: approve ? (admin ? {
        title: "Why are you confirming on behalf of the owner?", label: "Audit reason", minLength: 10, confirmText: "Continue",
      } : undefined) : {
        title: "Reject this proof?",
        text: "The customer can upload a replacement when time and attempts remain.",
        label: "Reason shown to the customer", confirmText: "Reject proof",
        choices: ["Amount not received", "Different amount", "Wrong account", "Unclear proof"],
      },
      setPending: (pending) => setBusy(pending ? payment.id : ""),
      run: async (reason) => {
        const db = createClient();
        if (!approve) {
          const { error } = await db.rpc("reject_booking_payment", { p_payment_id: payment.id, p_reason: reason });
          if (error) throw error;
          return;
        }
        const { data, error } = await db.rpc("confirm_booking_payment", {
          p_payment_id: payment.id,
          p_received_amount: admin ? null : Number(inputs[payment.id]?.amount),
          p_received_reference: admin ? null : inputs[payment.id]?.reference,
          p_admin_note: admin ? reason : null,
        });
        if (error) throw error;
        if (data === "CREDITS_SHORT") {
          router.refresh();
          throw new Error("Top up your owner credits to confirm this payment. The booking is still in review.");
        }
      },
      success: approve ? "Payment confirmed" : "Payment proof rejected",
      refresh: router.refresh,
    });
  }

  if (!payments.length) return <p className="rounded-xl border bg-white p-10 text-center text-sm text-slate-500">No deposits waiting for review.</p>;
  return <div ref={listRef} className="space-y-4">{payments.map((payment) => {
    const input = inputs[payment.id] ?? { amount: "", reference: "" };
    const reference = normalizePaymentReference(payment.reference_no ?? "");
    const matches = input.amount !== "" && Number(input.amount) === Number(payment.amount)
      && reference !== "" && normalizePaymentReference(input.reference) === reference;
    const deadline = payment.booking?.review_due_at;
    const minutes = deadline && now !== null ? Math.ceil((Date.parse(deadline) - now) / 60000) : null;
    const flags = [...new Set([...payment.flags, ...(payment.booking?.payment_flags ?? [])])];
    return <article key={payment.id} className="grid gap-5 rounded-xl border bg-white p-5 md:grid-cols-[180px_minmax(0,1fr)]">
      <div>{urls[payment.id] ? <a href={urls[payment.id]} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={urls[payment.id]} alt="Customer payment proof" className="max-h-56 rounded-lg object-contain" />
      </a> : <p className="text-sm text-slate-500">Proof image unavailable</p>}</div>
      <div>
        <h2 className="font-semibold">{payment.booking?.reference ?? payment.booking_id}</h2>
        <p className="mt-1 break-words text-sm text-slate-700">{paymentPeso(payment.amount)} · Transfer reference {payment.reference_no}</p>
        {deadline && <p className="text-sm text-slate-600">Review by {paymentDate(deadline)} Manila time{minutes !== null && (minutes > 0 ? ` · ${Math.floor(minutes / 60)}h ${minutes % 60}m left` : " · Deadline passed")}</p>}
        <div className="mt-2 flex flex-wrap gap-2">{flags.map((flag) => <span key={flag} className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-950">{flag.replaceAll("_", " ")}</span>)}</div>
        {!admin && <>
          <p className="mt-3 text-sm">Open your GCash, Maya or bank app. Do you see {paymentPeso(payment.amount)} with reference {payment.reference_no}? Type them below to confirm.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="text-sm">Received amount<input type="number" min="0" step="0.01" inputMode="decimal" value={input.amount} onChange={(event) => setInputs({ ...inputs, [payment.id]: { ...input, amount: event.target.value } })} className="mt-1 w-full rounded-lg border p-2" /></label>
            <label className="text-sm">Received reference<input value={input.reference} onChange={(event) => setInputs({ ...inputs, [payment.id]: { ...input, reference: event.target.value } })} className="mt-1 w-full rounded-lg border p-2" /></label>
          </div>
        </>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button disabled={!!busy || (!admin && (!matches || (minutes !== null && minutes <= 0)))} onClick={() => review(payment, true)} className="rounded-lg bg-green-700 px-3 py-3 text-sm text-white disabled:opacity-50">{busy === payment.id ? "Working…" : admin ? "Confirm on behalf of owner" : "Confirm payment"}</button>
          <button disabled={!!busy} onClick={() => review(payment, false)} className="rounded-lg border px-3 py-3 text-sm text-red-700">Reject proof</button>
        </div>
      </div>
    </article>;
  })}</div>;
}
