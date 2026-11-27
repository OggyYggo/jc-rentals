import { ErrorState } from "@/components/loading/ErrorState";
import Link from "next/link";
import { Plus } from "lucide-react";
import { paymentPeso } from "@/lib/payment-format";
import type { CreditState } from "../credit-state";
import { CreditActivity } from "./activity";
import { creditDate, type CreditActivityRow } from "./data";
import { CreditsHeading } from "./navigation";
import { CreditsExplainer } from "./status";
import { creditsHref, danger, panelShape, primary, screen, secondary, topUpHref, warning } from "./styles";

export function MobileCreditsHome({ state, minimum, rate, payoutVerified, activityUnavailable, rows, unfinishedOrder, hasInvoices }: {
  state: CreditState; minimum: number; rate: number; payoutVerified: boolean | null; rows: CreditActivityRow[];
  unfinishedOrder?: string; hasInvoices: boolean; activityUnavailable?: boolean;
}) {
  const available = Number(state.available);
  const pending = Number(state.pending_fees);
  const hidden = available < minimum;
  const empty = available <= 0;
  const low = !hidden && available < Number(state.low_threshold);
  const needsCredits = hidden || empty || low;
  const bar = needsCredits && minimum > 0 ? Math.min(100, Math.max(0, available / minimum * 100)) : 100;
  const manual = rows.find(row => row.type === "topup" && row.status === "pending");

  let listingMessage = payoutVerified === true ? "Your vehicles are visible to customers."
    : payoutVerified === false ? "Verify a payment method to list your vehicles." : "Your credits meet the listing minimum.";
  if (hidden) listingMessage = empty
    ? `Your vehicles are hidden. Add at least ${paymentPeso(minimum - available)} to list them again.`
    : `Your vehicles are hidden. Add ${paymentPeso(minimum - available)} to reach the ${paymentPeso(minimum)} minimum.`;
  else if (low && payoutVerified !== false) listingMessage = `You meet the ${paymentPeso(minimum)} minimum. Top up to keep your vehicles listed.`;

  return <div className={screen}>
    <CreditsHeading back="Money" href="/owner" history title="Credits" description="Prepaid balance for platform fees." />
    <section className={`min-w-0 space-y-3 rounded-2xl border p-4 ${needsCredits ? "border-[#F3DBA7] bg-[#FFF8E8]" : "border-[#D6E6F7] bg-[#EAF4FF]"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Available credits</h2>
        {needsCredits && <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${empty ? danger : warning}`}>{empty ? "No credits" : "Low"}</span>}
      </div>
      <p className="break-words font-heading text-4xl font-bold tracking-tight tabular-nums">{paymentPeso(available)}</p>
      <p className="break-words text-sm text-[#5B6F89]">
        Balance {paymentPeso(Number(state.balance))}{pending > 0 && ` · ${paymentPeso(pending)} held for pending bookings`}
      </p>
      <div aria-hidden className={`h-2 overflow-hidden rounded-full ${needsCredits ? "bg-[#F3DBA7]" : "bg-[#D6E6F7]"}`}>
        <div className={`h-full rounded-full ${needsCredits ? "bg-[#8A5A00]" : "bg-[#0A47B1]"}`} style={{ width: `${bar}%` }} />
      </div>
      <p className="break-words text-sm font-medium">{listingMessage}</p>
      <Link href={topUpHref} className={primary}><Plus size={20} aria-hidden /> Top up credits</Link>
    </section>
    <CreditsExplainer openByDefault={needsCredits || rows.length === 0} minimum={minimum} rate={rate} />
    {manual && <aside className={`${panelShape} ${warning} border-[#F3DBA7]`}>
      <h2 className="font-heading font-bold">Top-up waiting for review</h2>
      <p className="mt-1 break-words text-sm">{paymentPeso(Number(manual.amount))} · sent {creditDate(manual.created_at, true)}</p>
      <p className="mt-1 text-sm">Usually reviewed the same day.</p>
    </aside>}
    {unfinishedOrder && <aside className={`${panelShape} ${warning} border-[#F3DBA7]`}>
      <h2 className="mb-2 font-heading font-bold">Online payment not finished</h2>
      <Link href={`${creditsHref}?topup=${unfinishedOrder}`} className={secondary}>Check payment status</Link>
    </aside>}
    {activityUnavailable ? <ErrorState variant="connection" message="Couldn't load credit activity" /> : <CreditActivity rows={rows} />}
    {hasInvoices && <Link href={`${creditsHref}?view=invoices`} className={secondary}>View invoices</Link>}
  </div>;
}
