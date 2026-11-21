import { PageHeading } from "@/components/owner/ui";
import { OwnerPaymentReview } from "@/components/owner/payment-review";
import { RefundQueue, type RefundRow } from "@/components/owner/refund-queue";
import { PaymentTabs } from "@/components/payment-tabs";
import { getOwnerContext } from "@/lib/owner-context";

export const instant = false;

const tabs = { review: "Needs review", refunds: "Refunds" };

export default async function OwnerPaymentsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { supabase, owner, user } = await getOwnerContext();
  const { tab: requested } = await searchParams;
  const tab = requested === "refunds" ? requested : "review";

  let content;
  if (tab === "refunds") {
    const { data, error } = await supabase.from("booking_refunds")
      .select("id,booking_id,amount,due_at,status,refund_proof_path,booking:bookings(reference)").eq("owner_id", owner.id).order("due_at").returns<RefundRow[]>();
    if (error) throw new Error("Could not load refunds.");
    content = <RefundQueue refunds={data ?? []} userId={user.id} />;
  } else {
    const { data, error } = await supabase.from("payments")
      .select("id,booking_id,amount,reference_no,proof_path,paid_at,proof_sha256,flags,booking:bookings(reference,review_due_at,payment_flags)")
      .eq("owner_id", owner.id).eq("status", "pending").order("paid_at");
    if (error) throw new Error("Could not load payment review queue.");
    content = <OwnerPaymentReview payments={(data ?? []) as never} />;
  }

  return <>
    <PageHeading eyebrow="Payments" title="Booking payments" description="Check each transfer in your wallet or bank history before confirming it." />
    <PaymentTabs path="/owner/payments" active={tab} tabs={tabs} />
    {content}
  </>;
}
