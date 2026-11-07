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
  const [{ data: owner }, { data: balance }, { data: setting }, { data: overdueInvoices }] = await Promise.all([
    supabase.from("owners").select("id,business_name,is_active,fee_mode,commission_rate,deposit_percent,payment_method_label,payment_account_name,payment_qr_path,payment_qr_verified").eq("id", id).maybeSingle(),
    supabase.from("owner_credit_balances").select("balance").eq("owner_id", id).maybeSingle(),
    supabase.from("settings").select("value").eq("key", "min_credit_to_list").maybeSingle(),
    supabase.from("commission_invoices").select("id").eq("owner_id", id).eq("status", "unpaid").lt("due_date", manilaDate()),
  ]);
  if (!owner) notFound();

  let qrUrl: string | null = null;
  if (owner.payment_qr_path) {
    const { data } = await supabase.storage.from("owner-qr").createSignedUrl(owner.payment_qr_path, 300);
    qrUrl = data?.signedUrl ?? null;
  }

  const readiness = {
    isActive: owner.is_active,
    qrVerified: owner.payment_qr_verified,
    feeMode: owner.fee_mode,
    creditBalance: Number(balance?.balance ?? 0),
    minimumCredit: Number(setting?.value ?? 500),
    overdueInvoiceCount: overdueInvoices?.length ?? 0,
  };

  return <>
    <AdminHeading eyebrow="Owners" title={owner.business_name} description="Review the payment account and configure booking eligibility, payment terms, and deposits." />
    <AdminOwnerPaymentTerms owner={owner as never} qrUrl={qrUrl} readiness={readiness} />
  </>;
}
