import { ownerPaymentOptions, signPaymentQr } from "@/lib/payments/qr";
import type { ManagedPaymentOption } from "@/lib/payments/providers";
import { CancellationSettings } from "@/components/admin/cancellation-settings";
import { EntityHistory } from "@/components/admin/audit/EntityHistory";
import { notFound } from "next/navigation";
import { AdminHeading } from "@/components/admin/ui";
import { getAdminContext } from "@/lib/admin-context";
import { AdminOwnerPaymentTerms } from "@/components/admin/owner-payment-terms";

export const instant = false;

function manilaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function AdminOwnerPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getAdminContext();
  const [{ data: owner }, { data: balance }, { data: setting }, { data: overdueInvoices }, { data: paymentOptions, error: optionError }] = await Promise.all([
    supabase.from("owners").select("id,business_name,is_active,fee_mode,commission_rate,deposit_percent,cancellation_free_hours,cancellation_fee_percent").eq("id", id).maybeSingle(),
    supabase.from("owner_credit_balances").select("balance").eq("owner_id", id).maybeSingle(),
    supabase.from("settings").select("value").eq("key", "min_credit_to_list").maybeSingle(),
    supabase.from("commission_invoices").select("id").eq("owner_id", id).eq("status", "unpaid").lt("due_date", manilaDate()),
    ownerPaymentOptions(supabase, id).returns<ManagedPaymentOption[]>(),
  ]);
  if (!owner) notFound();

  if (optionError) throw new Error("Could not load payment options.");
  const options = await Promise.all((paymentOptions ?? []).map(async ({ qr_path, qr_bucket, ...option }) => ({
    ...option, qrUrl: await signPaymentQr({ qr_path, qr_bucket }),
  })));

  const readiness = {
    isActive: owner.is_active,
    qrVerified: options.some(option => option.verified),
    feeMode: owner.fee_mode,
    creditBalance: Number(balance?.balance ?? 0),
    minimumCredit: Number(setting?.value ?? 500),
    overdueInvoiceCount: overdueInvoices?.length ?? 0,
  };

  return <>
    <AdminHeading eyebrow="Owners" title={owner.business_name} description="Review payment options and configure booking eligibility, payment terms, and deposits." />
    <AdminOwnerPaymentTerms owner={owner} options={options} readiness={readiness} />
    <CancellationSettings ownerId={id} hours={owner.cancellation_free_hours} percent={owner.cancellation_fee_percent}/>
    <EntityHistory entity="owner" id={id}/>
  </>;
}
