"use client";

import { runWithAlerts } from "@/lib/alerts/run";
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
  const [errors, setErrors] = useState<{ proof?: string; reference?: string }>({});

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!proof || !["image/jpeg", "image/png", "image/webp"].includes(proof.type) || proof.size > 10 * 1024 * 1024) {
      setErrors({ proof: "Choose a JPG, PNG, or WebP payment proof under 10 MB." }); return;
    }
    if (reference.trim().length < 6 || reference.trim().length > 40) { setErrors({ reference: "Enter a transaction reference between 6 and 40 characters." }); return; }
    setErrors({});
    await runWithAlerts({
      setPending: setBusy,
      run: async () => {
        const db = createClient();
        const { data: auth } = await db.auth.getUser();
        if (!auth.user) throw new Error("Please sign in again to submit payment.");
        const extension = proof.type === "image/png" ? "png" : proof.type === "image/webp" ? "webp" : "jpg";
        const path = `${auth.user.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await db.storage.from("owner-plan-proofs").upload(path, proof, { contentType: proof.type, upsert: false });
        if (uploadError) throw uploadError;
        const { error } = await db.rpc("submit_plan_payment", {
          p_plan_code: plan.code, p_months: months, p_reference: reference.trim(), p_proof_path: path,
        });
        if (error) {
          await db.storage.from("owner-plan-proofs").remove([path]);
          throw error;
        }
      },
      success: "Payment sent for review",
      refresh: router.refresh,
    });
  }

  return <section id="plan-payment" className="rounded-xl border border-[#cfe0f8] bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-[#293a52]">Pay for {plan.name}</h2><p className="mt-1 text-sm text-[#697991]">You pay nothing at application. Your plan activates after an administrator confirms this payment.</p>
    {pending ? <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">A plan payment is waiting for review.</p> : <form onSubmit={submit} className="mt-5 grid gap-5 md:grid-cols-[220px_1fr]">
      <div className="rounded-xl bg-[#f3f8ff] p-4 text-center">{qrUrl ? <img src={qrUrl} alt="Kuyog Bohol plan payment QR" className="mx-auto max-h-48 rounded-lg object-contain"/> : <p className="py-10 text-xs text-[#687992]">Payment QR is not configured yet. Contact support to pay.</p>}{accountName && <p className="mt-3 text-sm font-semibold text-[#33455e]">{accountName}</p>}</div>
      <div className="space-y-4"><label className="block text-xs font-semibold text-[#52657e]">Months<select value={months} onChange={(event) => setMonths(Number(event.target.value))} className="mt-1 block h-10 w-full rounded-lg border border-[#dfe6ef] px-3 text-sm">{[1,3,6,12].map((count) => <option key={count} value={count}>{count} month{count > 1 ? "s" : ""}</option>)}</select></label><p className="rounded-lg bg-[#f3f8ff] p-3 text-sm font-semibold text-[#244b80]">Amount to pay: {peso(Number(plan.price_php) * months)}</p><label className="block text-xs font-semibold text-[#52657e]">Transaction reference<input required minLength={6} maxLength={40} aria-invalid={Boolean(errors.reference)} aria-describedby={errors.reference ? "plan-reference-error" : undefined} value={reference} onChange={(event) => setReference(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-[#dfe6ef] px-3 text-sm"/>{errors.reference && <span id="plan-reference-error" role="alert" className="mt-1 block text-red-700">{errors.reference}</span>}</label><label className="block text-xs font-semibold text-[#52657e]">Payment proof<input required type="file" aria-invalid={Boolean(errors.proof)} aria-describedby={errors.proof ? "plan-proof-error" : undefined} accept="image/jpeg,image/png,image/webp" onChange={(event) => setProof(event.target.files?.[0] ?? null)} className="mt-1 block w-full rounded-lg border border-[#dfe6ef] p-2 text-xs"/>{errors.proof && <span id="plan-proof-error" role="alert" className="mt-1 block text-red-700">{errors.proof}</span>}</label><button disabled={busy || !qrUrl} className="h-11 rounded-lg bg-[#2457d6] px-5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Submitting…" : "Submit for review"}</button></div>
    </form>}
  </section>;
}
