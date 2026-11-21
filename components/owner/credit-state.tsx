import Link from "next/link";
import { paymentPeso } from "@/lib/payment-format";

export type CreditState = { balance: number; pending_fees: number; available: number; low_threshold: number };

export function CreditBanner({ state, topUpHref = "/owner/credits#top-up" }: { state: CreditState; topUpHref?: string }) {
  const low = state.available < state.low_threshold;
  return <section className={`mb-4 rounded-xl border p-4 text-sm ${low ? "border-amber-300 bg-amber-50" : "bg-white"}`}>
    <h2 className="font-semibold">Owner credits</h2>
    <p className="mt-1">Balance {paymentPeso(state.balance)} · Pending fees {paymentPeso(state.pending_fees)} · Available {paymentPeso(state.available)}</p>
    {low && <p className="mt-1">{state.available <= 0 ? "No credits available for new bookings." : "Credits are running low."}</p>}
    <Link href={topUpHref} className="mt-2 inline-block font-semibold text-blue-800 underline">Top up</Link>
  </section>;
}
