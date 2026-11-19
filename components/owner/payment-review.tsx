"use client";
import { runWithAlerts } from "@/lib/alerts/run";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
type Payment = { id: string; booking_id: string; amount: number; method: string; reference_no: string; proof_path: string; paid_at: string; booking: { reference: string; total_price: number; start_date: string; car: { brand: string; model: string } | null } | null };
export function OwnerPaymentReview({ payments }: { payments: Payment[] }) {
  const router = useRouter(); const [urls, setUrls] = useState<Record<string, string>>({}); const [busy, setBusy] = useState("");
  useEffect(() => { const supabase = createClient(); Promise.all(payments.map(async p => { const { data } = await supabase.storage.from("payment-proofs").createSignedUrl(p.proof_path, 300); if (data?.signedUrl) setUrls(u => ({ ...u, [p.id]: data.signedUrl })); })); }, [payments]);
  function review(payment: Payment, approve: boolean) {
    return runWithAlerts({
      confirm: approve ? {
        title: "Confirm this deposit?",
        text: `Verify that you received ₱${Number(payment.amount).toLocaleString("en-PH")} for ${payment.booking?.reference ?? "this booking"}.`,
        confirmText: "Confirm deposit",
      } : undefined,
      reason: approve ? undefined : {
        title: "Reject this payment proof?", label: "Reason shown to the customer", confirmText: "Reject proof",
      },
      setPending: (pending) => setBusy(pending ? payment.id : ""),
      run: async (reason) => {
        const db = createClient();
        const { error } = approve
          ? await db.rpc("confirm_booking_payment", { p_payment_id: payment.id })
          : await db.rpc("reject_booking_payment", { p_payment_id: payment.id, p_reason: reason });
        if (error) throw error;
      },
      success: approve ? "Deposit confirmed" : "Payment proof rejected",
      refresh: router.refresh,
    });
  }
  if (!payments.length) return <div className="rounded-xl border bg-white p-10 text-center text-sm text-slate-500">No deposits waiting for review.</div>;
  return <div className="space-y-4">{payments.map(p => <article key={p.id} className="grid gap-5 rounded-xl border bg-white p-5 md:grid-cols-[180px_1fr]"><div>{urls[p.id] ? <a href={urls[p.id]} target="_blank" rel="noreferrer"><img src={urls[p.id]} alt="Customer payment proof" className="max-h-56 rounded-lg object-contain"/></a> : <div className="h-40 animate-pulse rounded bg-slate-100"/>}</div><div><h2 className="font-semibold">{p.booking?.reference ?? p.booking_id}</h2><p className="mt-1 text-sm text-slate-600">{p.booking?.car ? `${p.booking.car.brand} ${p.booking.car.model} · ` : ""}Transfer reference: {p.reference_no}</p><p className="mt-1 text-sm text-slate-600">Amount ₱{Number(p.amount).toLocaleString("en-PH")} · {new Date(p.paid_at).toLocaleString("en-PH")}</p><p className="mt-2 text-xs text-amber-800">Verify this transfer in your own payment account before confirming.</p><div className="mt-4 flex gap-2"><button disabled={!!busy} onClick={() => review(p, true)} className="rounded-lg bg-green-700 px-3 py-2 text-sm text-white">{busy === p.id ? "Working…" : "Confirm deposit"}</button><button disabled={!!busy} onClick={() => review(p, false)} className="rounded-lg border px-3 py-2 text-sm text-red-700">Reject proof</button></div></div></article>)}</div>;
}
