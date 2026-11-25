import { PageHeading } from "@/components/owner/ui";
import { OwnerPaymentReview } from "@/components/owner/payment-review";
import { RefundQueue, type RefundRow } from "@/components/owner/refund-queue";
import { DisputeList, type Dispute } from "@/components/payment-disputes";
import Link from "next/link";
import { CircleCheck, Clock3, Hourglass, RotateCcw } from "lucide-react";
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
  let reviewCount = 0;
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
      .select("id,booking_id,amount,reference_no,payment_provider,payment_label,proof_path,paid_at,proof_sha256,flags,booking:bookings(reference,review_due_at,payment_flags,car:cars!bookings_car_id_fkey(brand,model))")
      .eq("owner_id", owner.id).eq("status", "pending").order("paid_at");
    if (error) throw new Error("Could not load payment review queue.");
    reviewCount = data?.length ?? 0;
    content = <OwnerPaymentReview payments={(data ?? []) as never} />;
  }

  const metrics = [
    { label: "Confirmed", value: stats?.confirmed ?? 0, icon: CircleCheck, style: "bg-emerald-50 text-emerald-800" },
    { label: "No response", value: stats?.no_response ?? 0, icon: Hourglass, style: "bg-slate-100 text-slate-700" },
    { label: "Overdue refunds", value: stats?.refunds_overdue ?? 0, icon: RotateCcw, style: "bg-amber-50 text-amber-900" },
    { label: "Median review time", value: stats?.median_seconds_to_act == null ? "—" : `${Math.round(stats.median_seconds_to_act / 60)} min`, icon: Clock3, style: "bg-blue-50 text-blue-800" },
  ];

  return <>
    {tab === "review" ? <>
      <div className="mb-4 font-body md:hidden">
        <div className="flex flex-wrap items-center gap-2"><h1 className="font-heading text-[28px] font-bold tracking-tight text-[#0F2342]">Deposits</h1>
          <span className="rounded-full bg-[#EAF4FF] px-2.5 py-1 text-xs font-semibold text-[#0A47B1]">{reviewCount} to review</span></div>
        <p className="mt-1 text-sm text-[#5B6F89]">Check each payment in your app, then confirm.</p>
      </div>
      <div className="hidden md:block"><PageHeading title="Booking payments" description="Check each payment in your app, then confirm." /></div>
    </> : <PageHeading title="Booking payments" description="Check each transfer in your wallet or bank history before confirming it." />}
    <section aria-labelledby="payment-performance" className={`mb-4 rounded-xl border border-[#dce5f1] bg-white p-3 lg:mb-5 lg:rounded-2xl lg:p-5 ${tab === "review" ? "hidden md:block" : ""}`}>
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3 lg:mb-4">
        <h2 id="payment-performance" className="text-sm font-semibold text-[#20334e]">Payment performance</h2>
        <p className="text-xs text-[#51647f]">Last 90 days</p>
      </div>
      <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3">
        {metrics.map(({ label, value, icon: Icon, style }) => <div key={label} className="min-w-0 rounded-lg border border-[#e8eef7] bg-[#f8fbff] px-2.5 py-2 lg:rounded-xl lg:p-3.5">
          <dt className="flex items-center gap-1.5 text-xs font-medium leading-4 text-[#405775] lg:gap-2">
            <span className={`grid size-6 shrink-0 place-items-center rounded-md lg:size-8 ${style}`}><Icon size={15} aria-hidden="true" /></span>{label}
          </dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums text-[#20334e] lg:mt-2 lg:text-2xl">{value}</dd>
        </div>)}
      </dl>
    </section>
    <nav aria-label="Payment views" className="mb-3 grid grid-cols-3 gap-1 rounded-xl border border-[#dce5f1] bg-white p-1 lg:mb-4 lg:flex lg:w-fit">
      {Object.entries(tabs).map(([key, label]) => <Link key={key} href={`/owner/payments?tab=${key}`} aria-current={key === tab ? "page" : undefined}
        className={`inline-flex min-h-11 items-center justify-center rounded-lg px-1 py-1 text-center text-xs font-semibold leading-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 lg:px-5 lg:text-sm ${key === tab ? "bg-[#2457d6] text-white" : "text-[#405775] hover:bg-[#edf4ff]"}`}>
        {label}
      </Link>)}
    </nav>
    {content}
  </>;
}
