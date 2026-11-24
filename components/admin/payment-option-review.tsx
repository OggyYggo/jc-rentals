"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PaymentProviderTile } from "@/components/payment-provider-tile";
import { SubmitButton } from "@/components/loading/SubmitButton";
import { runWithAlerts } from "@/lib/alerts/run";
import type { ManagedPaymentOption } from "@/lib/payments/providers";
import { createClient } from "@/lib/supabase/client";

export type ReviewOption = Omit<ManagedPaymentOption, "qr_path" | "qr_bucket"> & { qrUrl: string | null };

export function AdminPaymentOptionReview({ options }: { options: ReviewOption[] }) {
  const router = useRouter();
  const [decision, setDecision] = useState("");

  function verify({ id, updated_at }: ReviewOption, value: boolean) {
    return runWithAlerts({
      confirm: value ? { title: "Mark this QR as verified?", confirmText: "Verify QR" } : undefined,
      reason: value ? undefined : { title: "Reject payment option", label: "Reason for the owner", confirmText: "Reject option" },
      setPending: pending => setDecision(pending ? `${id}:${value}` : ""),
      run: async (reason) => {
        const { error } = await createClient().rpc("admin_set_payment_option_verified", {
          p_option_id: id, p_verified: value, p_reason: reason || null, p_expected_updated_at: updated_at,
        });
        if (error) throw error;
      },
      success: value ? "Payment option verified" : "Payment option rejected",
      refresh: router.refresh,
    });
  }

  return <section className="rounded-xl border bg-white p-5">
    <h2 className="font-semibold">Owner payment options</h2>
    {options.length === 0 && <p className="mt-2 text-sm text-slate-600">No payment options yet.</p>}
    {options.map(option => <article key={option.id} className="mt-4 space-y-3 border-t pt-4">
      <div className="flex items-center gap-3">
        <PaymentProviderTile provider={option.provider} />
        <div className="min-w-0 break-words">
          <h3 className="font-semibold">{option.label}</h3>
          <p className="text-sm">{option.account_name}{option.account_hint && ` · ${option.account_hint}`}</p>
        </div>
      </div>
      {option.qrUrl ? <a href={option.qrUrl} target="_blank" rel="noreferrer" className="inline-block" aria-label={`View ${option.label} QR`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={option.qrUrl} alt={`${option.label} payment QR`} className="max-h-44 rounded border p-2" />
      </a> : <p className="text-sm text-amber-800">QR preview unavailable.</p>}
      <p className="break-words text-sm font-semibold">
        {option.verified ? "Verified" : option.rejection_reason ? `Rejected: ${option.rejection_reason}` : "Under review"}
      </p>
      <div className="flex flex-wrap gap-2">
        {!option.verified && <SubmitButton type="button" className="min-h-11" disabled={Boolean(decision) || !option.qrUrl}
          busy={decision === `${option.id}:true`} pendingText="Verifying…" onClick={() => verify(option,true)}>Verify</SubmitButton>}
        <SubmitButton type="button" className="min-h-11" disabled={Boolean(decision)}
          busy={decision === `${option.id}:false`} pendingText="Rejecting…" onClick={() => verify(option,false)}>Reject with reason</SubmitButton>
      </div>
    </article>)}
  </section>;
}
