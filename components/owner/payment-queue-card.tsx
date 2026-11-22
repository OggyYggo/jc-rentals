"use client";

import { ChevronDown, Inbox } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

export function PaymentQueueCard({ title, amount, badge, detail, action, children }: {
  title: string; amount?: string; badge: ReactNode; detail: ReactNode; action: string; children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();

  return <article className="min-w-0 overflow-hidden rounded-xl border border-[#dce5f1] bg-white lg:rounded-2xl">
    <header className="border-b border-[#e9eff7] bg-[#f7faff] px-3.5 py-3 lg:px-5 lg:py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
        <h2 className="min-w-0 break-all text-sm font-semibold text-[#20334e] lg:text-base">{title}</h2>
        {badge}
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 break-words text-xs leading-5 text-[#51647f] lg:text-sm">
        {amount && <strong className="text-base font-semibold tabular-nums text-[#20334e] lg:text-lg">{amount}</strong>}
        {detail}
      </div>
    </header>
    <button type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}
      className="flex min-h-11 w-full items-center justify-between gap-2 px-3.5 text-left text-xs font-semibold text-[#214a86] hover:bg-[#f7faff] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-700 lg:hidden">
      {expanded ? "Hide details" : action}
      <ChevronDown size={16} aria-hidden="true" className={expanded ? "rotate-180" : undefined} />
    </button>
    <div id={id} className={`${expanded ? "block border-t border-[#e9eff7]" : "hidden"} min-w-0 p-3.5 lg:block lg:border-t-0 lg:p-5`}>{children}</div>
  </article>;
}

export function PaymentQueueBadge({ label, tone = "blue" }: { label: string; tone?: "blue" | "amber" | "green" | "neutral" }) {
  const colors = { blue: "bg-blue-100 text-blue-900", amber: "bg-amber-100 text-amber-950", green: "bg-emerald-100 text-emerald-900", neutral: "bg-slate-200 text-slate-800" };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${colors[tone]}`}>{label}</span>;
}

export function PaymentQueueEmpty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-[#dce5f1] bg-white px-4 py-7 text-center lg:py-12">
    <span className="mx-auto mb-2 grid size-10 place-items-center rounded-lg bg-[#edf4ff] text-[#315fae]"><Inbox size={19} aria-hidden="true" /></span>
    <p className="text-sm font-medium text-[#405775]">{children}</p>
  </div>;
}
