"use client";

import { runWithAlerts } from "@/lib/alerts/run";
import { AdminPaymentOptionReview, type ReviewOption } from "@/components/admin/payment-option-review";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Owner = {
  id: string;
  business_name: string;
  is_active: boolean;
  fee_mode: string;
  commission_rate: number;
  deposit_percent: number | null;
};

type Readiness = {
  isActive: boolean;
  qrVerified: boolean;
  feeMode: string;
  creditBalance: number;
  minimumCredit: number;
  overdueInvoiceCount: number;
};

export function AdminOwnerPaymentTerms({
  owner,
  options,
  readiness,
}: {
  owner: Owner;
  options: ReviewOption[];
  readiness: Readiness;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const commission = Number(form.get("commission")) / 100;
    const depositValue = String(form.get("deposit"));
    const deposit = depositValue === "" ? null : Number(depositValue) / 100;
    const feeMode = String(form.get("fee_mode"));
    const percent = new Intl.NumberFormat("en-PH", { style: "percent", maximumFractionDigits: 2 });
    const depositLabel = (value: number | null) => value === null ? "Platform default" : percent.format(value);
    const feeLabel = (value: string) => value === "credits" ? "Prepaid credits" : "Monthly invoice";
    const changes = [
      ...(feeMode !== owner.fee_mode ? [`Fee mode ${feeLabel(owner.fee_mode)} → ${feeLabel(feeMode)}`] : []),
      ...(commission !== Number(owner.commission_rate) ? [`Commission ${percent.format(Number(owner.commission_rate))} → ${percent.format(commission)}`] : []),
      ...(deposit !== owner.deposit_percent ? [`Deposit ${depositLabel(owner.deposit_percent)} → ${depositLabel(deposit)}`] : []),
    ];
    if (!changes.length) return;
    return runWithAlerts({
      confirm: { title: "Change this owner's payment terms?", text: changes.join("\n") + "\nApplies to new bookings only.", confirmText: "Save terms" },
      setPending: setBusy,
      run: async () => {
        const { error } = await createClient().rpc("admin_set_owner_payment_terms", {
          p_owner_id: owner.id, p_fee_mode: feeMode, p_commission_rate: commission, p_deposit_percent: deposit,
        });
        if (error) throw error;
      },
      success: "Payment terms saved",
      refresh: router.refresh,
    });
  }

  const creditShortfall = readiness.feeMode === "credits"
    ? Math.max(0, readiness.minimumCredit - readiness.creditBalance)
    : 0;
  const canAccept = readiness.isActive
    && readiness.qrVerified
    && (readiness.feeMode === "credits"
      ? readiness.creditBalance >= readiness.minimumCredit
      : readiness.overdueInvoiceCount === 0);

  return <div className="max-w-4xl space-y-5">
    <section className={`rounded-xl border p-5 ${canAccept ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
      <h2 className="font-semibold">Booking eligibility: {canAccept ? "Ready" : "Blocked"}</h2>
      <ul className="mt-3 space-y-1.5 text-sm">
        <li>{readiness.isActive ? "✓" : "Needs attention:"} Owner account {readiness.isActive ? "is active" : "is inactive"}.</li>
        <li>{readiness.qrVerified ? "✓" : "Needs attention:"} Payment QR {readiness.qrVerified ? "is verified" : "needs admin verification"}.</li>
        {readiness.feeMode === "credits" ? (
          <li>{creditShortfall === 0 ? "✓" : "Needs attention:"} Prepaid credits: ₱{readiness.creditBalance.toLocaleString("en-PH")} / ₱{readiness.minimumCredit.toLocaleString("en-PH")} required{creditShortfall > 0 ? ` (₱${creditShortfall.toLocaleString("en-PH")} short)` : ""}.</li>
        ) : (
          <li>{readiness.overdueInvoiceCount === 0 ? "✓" : "Needs attention:"} {readiness.overdueInvoiceCount === 0 ? "No overdue invoices" : `${readiness.overdueInvoiceCount} overdue invoice${readiness.overdueInvoiceCount === 1 ? "" : "s"}`}.</li>
        )}
      </ul>
    </section>

    <div className="grid gap-5 md:grid-cols-2">
      <AdminPaymentOptionReview options={options} />

      <form onSubmit={save} className="space-y-4 rounded-xl border bg-white p-5">
        <h2 className="font-semibold">Payment terms</h2>
        <label className="block text-sm">Fee mode<select name="fee_mode" defaultValue={owner.fee_mode} className="mt-1 block w-full rounded border p-2"><option value="credits">Prepaid credits</option><option value="invoice">Monthly invoice</option></select></label>
        <label className="block text-sm">Commission percent<input name="commission" type="number" min="0" max="100" step="0.1" defaultValue={Number(owner.commission_rate) * 100} className="mt-1 block w-full rounded border p-2" /></label>
        <label className="block text-sm">Deposit percent<input name="deposit" type="number" min="10" max="100" step="1" defaultValue={owner.deposit_percent === null ? "" : Number(owner.deposit_percent) * 100} placeholder="Use platform default" className="mt-1 block w-full rounded border p-2" /></label>
        <button disabled={busy} className="rounded bg-blue-700 px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? "Saving…" : "Save terms"}</button>
      </form>
    </div>
  </div>;
}
