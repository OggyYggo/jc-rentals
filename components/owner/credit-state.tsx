import Link from "next/link";
import { ArrowUpRight, CircleAlert, Wallet } from "lucide-react";
import { paymentPeso } from "@/lib/payment-format";

export type CreditState = { balance: number; pending_fees: number; available: number; low_threshold: number };

export function CreditBanner({ state, topUpHref = "/owner/credits#top-up", className = "mb-4" }: {
  state: CreditState;
  topUpHref?: string;
  className?: string;
}) {
  const empty = state.available <= 0;
  const low = empty || state.available < state.low_threshold;
  return <section className={`flex min-w-0 flex-col rounded-2xl border bg-white p-5 shadow-sm ${low ? "border-amber-200" : "border-slate-200"} ${className}`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><Wallet size={19} aria-hidden /></span>
        <h2 className="text-sm font-semibold text-slate-800">Owner credits</h2>
      </div>
      {low && <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-950">
        <CircleAlert size={14} aria-hidden /> {empty ? "No available credits" : "Low credits"}
      </span>}
    </div>
    <dl className="mt-4">
      <div className="rounded-xl bg-slate-50 px-3 py-3">
        <dt className="text-xs font-medium text-slate-600">Available credits</dt>
        <dd className="mt-1 break-words text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{paymentPeso(state.available)}</dd>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="min-w-0"><dt className="text-xs text-slate-600">Balance</dt><dd className="mt-1 break-words text-sm font-semibold text-slate-800 tabular-nums">{paymentPeso(state.balance)}</dd></div>
        <div className="min-w-0"><dt className="text-xs text-slate-600">Pending fees</dt><dd className="mt-1 break-words text-sm font-semibold text-slate-800 tabular-nums">{paymentPeso(state.pending_fees)}</dd></div>
      </div>
    </dl>
    <div className="mt-auto pt-4">
      <Link href={topUpHref} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
        Top up <ArrowUpRight size={16} aria-hidden />
      </Link>
    </div>
  </section>;
}
