import { PageHeading } from "@/components/owner/ui";
import { OwnerPaymentSettingsForm } from "@/components/owner/payment-settings-form";
import { getOwnerContext } from "@/lib/owner-context";
import { ownerPaymentOptions, signPaymentQr } from "@/lib/payments/qr";
import type { ManagedPaymentOption } from "@/lib/payments/providers";

export const instant = false;

export default async function OwnerPaymentSettingsPage() {
  const { supabase, owner } = await getOwnerContext();
  const { data, error } = await ownerPaymentOptions(supabase, owner.id).returns<ManagedPaymentOption[]>();
  const options = await Promise.all((data ?? []).map(async option => ({
    ...option, qrUrl: await signPaymentQr(option),
  })));
  return <>
    <PageHeading eyebrow="Payments" title="Payment settings" />
    {error ? <p role="alert">We couldn’t load your payment options. Refresh to try again.</p>
      : <OwnerPaymentSettingsForm ownerId={owner.id} options={options} />}
  </>;
}
