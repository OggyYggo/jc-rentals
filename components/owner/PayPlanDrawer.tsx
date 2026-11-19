"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { peso } from "@/lib/plans/breakEven";

type PaidPlan = { id: string; code: string; name: string; price_php: number };

export function PayPlanDrawer({ plan, qrUrl, accountName, pending }: { plan: PaidPlan; qrUrl: string | null; accountName: string; pending: boolean }) {
  const router = useRouter();
  const [months, setMonths] = useState(1);
  const [reference, setReference] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setMessage("");
    if (!proof || !["image/jpeg", "image/png", "image/webp"].includes(proof.type) || proof.size > 10 * 1024 * 1024) {
      setError("Choose a JPG, PNG, or WebP payment proof under 10 MB."); return;
    }
    if (reference.trim().length < 6 || reference.trim().length > 40) { setError("Enter a transaction reference between 6 and 40 characters."); return; }
    setBusy(true);
    const db = createClient();
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) { setError("Please sign in again to submit payment."); setBusy(false); return; }
    const path = `${auth.user.id}/${crypto.randomUUID()}.${proof.type === "image/png" ? "png" : proof.type === "image/webp" ? "webp" : "jpg"}`;
    const { error: uploadError } = await db.storage.from("owner-plan-proofs").upload(path, proof, { contentType: proof.type, upsert: false });
    if (uploadError) { setError("We could not upload your proof. Please try again."); setBusy(false); return; }
    const { error: submitError } = await db.rpc("submit_plan_payment", { p_plan_code: plan.code, p_months: months, p_reference: reference.trim(), p_proof_path: path });
    if (submitError) {
      await db.storage.from("owner-plan-proofs").remove([path]);
      setError(submitError.message.includes("pending") ? "You already have a payment waiting for review." : submitError.message.toLowerCase().includes("reference") || submitError.message.includes("plan_payments_reference_unique") ? "That transaction reference has already been used. Check it and try again." : "We could not submit this payment. Check the details and try again.");
      setBusy(false); return;
    }
    setMessage("Payment submitted. We will review it and update your plan.");
    setBusy(false); router.refresh();
  }

  return <section id="plan-payment" className="rounded-xl border border-[#cfe0f8] bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-[#293a52]">Pay for {plan.name}</h2><p className="mt-1 text-sm text-[#697991]">You pay nothing at application. Your plan activates after an administrator confirms this payment.</p>
    {pending ? <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">A plan payment is waiting for review.</p> : <form onSubmit={submit} className="mt-5 grid gap-5 md:grid-cols-[220px_1fr]">
      <div className="rounded-xl bg-[#f3f8ff] p-4 text-center">{qrUrl ? <img src={qrUrl} alt="Kuyog Bohol plan payment QR" className="mx-auto max-h-48 rounded-lg object-contain"/> : <p className="py-10 text-xs text-[#687992]">Payment QR is not configured yet. Contact support to pay.</p>}{accountName && <p className="mt-3 text-sm font-semibold text-[#33455e]">{accountName}</p>}</div>
      <div className="space-y-4"><label className="block text-xs font-semibold text-[#52657e]">Months<select value={months} onChange={(event) => setMonths(Number(event.target.value))} className="mt-1 block h-10 w-full rounded-lg border border-[#dfe6ef] px-3 text-sm">{[1,3,6,12].map((count) => <option key={count} value={count}>{count} month{count > 1 ? "s" : ""}</option>)}</select></label><p className="rounded-lg bg-[#f3f8ff] p-3 text-sm font-semibold text-[#244b80]">Amount to pay: {peso(Number(plan.price_php) * months)}</p><label className="block text-xs font-semibold text-[#52657e]">Transaction reference<input required minLength={6} maxLength={40} value={reference} onChange={(event) => setReference(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-[#dfe6ef] px-3 text-sm"/></label><label className="block text-xs font-semibold text-[#52657e]">Payment proof<input required type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setProof(event.target.files?.[0] ?? null)} className="mt-1 block w-full rounded-lg border border-[#dfe6ef] p-2 text-xs"/></label>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}{message && <p role="status" className="text-sm text-green-700">{message}</p>}<button disabled={busy || !qrUrl} className="h-11 rounded-lg bg-[#2457d6] px-5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Submitting…" : "Submit for review"}</button></div>
    </form>}
  </section>;
}
