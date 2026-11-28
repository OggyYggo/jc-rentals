import { AdminPaymentSettings } from "./admin-payment-settings";
import { AlertSettings } from "./alert-settings";
import { CancellationSettings } from "./cancellation-settings";
import { PaymentHardeningSettings } from "./payment-hardening-settings";
import { PickupSettings } from "./PickupSettings";
import { PlatformSettingsForm } from "./platform-settings-form";
import type { PlatformSettings, SettingsSection } from "@/lib/admin-settings";
import type { alertSettings } from "@/lib/admin-alerts/settings";

export function SettingsForms({ settings, userId, alerts, section, mobile = false }: {
  settings: PlatformSettings | null;
  userId: string;
  alerts: Awaited<ReturnType<typeof alertSettings>>;
  section?: SettingsSection;
  mobile?: boolean;
}) {
  if (section === "email-alerts") return <AlertSettings settings={alerts} mobile={mobile} />;
  if (!settings) return <p role="status" className="rounded-xl border bg-white p-4 text-sm">Could not load platform settings.</p>;
  const { values: v } = settings;
  const defaults = (mobileSection?: "owner-defaults" | "rental-policies") => <PlatformSettingsForm bookingsPaused={v.bookings_paused}
    commissionRate={v.default_commission_rate} policies={v.rental_policies} updatedBy={userId} mobileSection={mobileSection} />;
  const payment = (mobileSection?: "credits" | "invoices" | "platform-payment") => <AdminPaymentSettings updatedBy={userId} settings={v} mobileSection={mobileSection} />;
  const timing = <PaymentHardeningSettings mobile={mobile} values={{ p_window: v.payment_window_hours, p_review: v.payment_review_hours,
    p_resubmit: v.payment_resubmit_grace_hours, p_refund: v.refund_due_days, p_threshold: v.credit_low_threshold }} />;
  const cancellation = <CancellationSettings mobile={mobile} hours={v.cancellation_free_hours} percent={v.cancellation_fee_percent}
    pickupHour={v.pickup_reference_hour} userId={userId} />;
  const pickup = <PickupSettings mobile={mobile} early={v.pickup_early_days} late={v.pickup_late_days} requireDocs={v.pickup_require_verified_docs} />;

  if (section === "owner-defaults" || section === "rental-policies") return defaults(mobile ? section : undefined);
  if (section === "credits" || section === "invoices" || section === "platform-payment") return payment(mobile ? section : undefined);
  if (section === "payment-timing") return timing;
  if (section === "cancellation") return cancellation;
  if (section === "pickup") return pickup;
  return <>
    {defaults()}
    <div className="admin-setting-section lg:contents"><h2 className="font-semibold lg:hidden">Policies</h2>{payment()}{timing}{cancellation}{pickup}</div>
    <div className="admin-setting-section lg:contents"><h2 className="font-semibold lg:hidden">Notifications</h2><AlertSettings settings={alerts} /></div>
  </>;
}
