import { PageHeading } from "@/components/owner/ui";
import { OwnerPaymentReview } from "@/components/owner/payment-review";
import { RefundQueue, type RefundRow } from "@/components/owner/refund-queue";
import { DisputeList, type Dispute } from "@/components/payment-disputes";
import { PaymentTabs } from "@/components/payment-tabs";
import { getOwnerContext } from "@/lib/owner-context";

export const instant = false;

const tabs = { review: "Needs review", refunds: "Refunds", disputes: "Disputes" };
type Stats = { confirmed: number; no_response: number; refunds_overdue: number; median_seconds_to_act: number | null };

export default async function OwnerPaymentsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { supabase, owner, user } = await getOwnerContext();
  const { tab: requested } = await searchParams;
  const tab = requested === "refunds" || requested === "disputes" ? requested : "review";
  const { data: stats, error: statsError } = await supabase.rpc("owner_payment_performance", { p_owner_id: owner.id }).maybeSingle<Stats>();
  if (statsError) throw new Error("Could not load payment performance.");

  let content;
  if (tab === "refunds") {
    const { data, error } = await supabase.from("booking_refunds")
      .select("id,booking_id,amount,due_at,status,refund_proof_path,booking:bookings(reference)").eq("owner_id", owner.id).order("due_at").returns<RefundRow[]>();
    if (error) throw new Error("Could not load refunds.");
    content = <RefundQueue refunds={data ?? []} userId={user.id} />;
  } else if (tab === "disputes") {
    const { data, error } = await supabase.from("payment_disputes").select("*,booking:bookings(reference)")
      .order("created_at", { ascending: false }).returns<Dispute[]>();
    if (error) throw new Error("Could not load disputes.");
    content = <DisputeList disputes={data ?? []} role="owner" />;
  } else {
    const { data, error } = await supabase.from("payments")
      .select("id,booking_id,amount,reference_no,proof_path,paid_at,proof_sha256,flags,booking:bookings(reference,review_due_at,payment_flags)")
      .eq("owner_id", owner.id).eq("status", "pending").order("paid_at");
    if (error) throw new Error("Could not load payment review queue.");
    content = <OwnerPaymentReview payments={(data ?? []) as never} />;
  }

  return <>
    <PageHeading eyebrow="Payments" title="Booking payments" description="Check each transfer in your wallet or bank history before confirming it." />
    <section className="mb-4 rounded-xl border bg-white p-4 text-sm">
      <h2 className="font-semibold">Payment performance · Last 90 days</h2>
      <p className="mt-1">{stats?.confirmed ?? 0} confirmed · {stats?.no_response ?? 0} without response · {stats?.refunds_overdue ?? 0} overdue refunds</p>
      <p>Median review time · {stats?.median_seconds_to_act == null ? "No reviews yet" : `${Math.round(stats.median_seconds_to_act / 60)} minutes`}</p>
      <p className="mt-1 text-slate-600">Fast confirmations get more bookings.</p>
    </section>
    <PaymentTabs path="/owner/payments" active={tab} tabs={tabs} />
    {content}
  </>;
}
