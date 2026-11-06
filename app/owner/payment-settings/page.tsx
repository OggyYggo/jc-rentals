import { PageHeading } from "@/components/owner/ui";
import { getOwnerContext } from "@/lib/owner-context";
import { OwnerPaymentSettingsForm } from "@/components/owner/payment-settings-form";

export const instant = false;
export default async function OwnerPaymentSettingsPage() {
  const { supabase, owner } = await getOwnerContext();
  const { data } = await supabase.from("owners").select("payment_method_label, payment_account_name, payment_qr_path, payment_qr_verified").eq("id", owner.id).single();
  let qrUrl: string | null = null;
  if (data?.payment_qr_path) { const { data: signed } = await supabase.storage.from("owner-qr").createSignedUrl(data.payment_qr_path, 300); qrUrl = signed?.signedUrl ?? null; }
  return <><PageHeading eyebrow="Payments" title="Payment settings" description="Set the account customers will pay for booking deposits. A changed QR needs admin verification."/><OwnerPaymentSettingsForm ownerId={owner.id} settings={data} qrUrl={qrUrl}/></>;
}
