"use client";

import { Check, ChevronDown, Clipboard, Clock, CircleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { paymentPeso } from "@/lib/payment-format";
import { channelLabel, type TopUpResult } from "./data";
import { CreditsHeading } from "./navigation";
import { creditSteps } from "@/lib/onboarding/content";
import { creditsHref, danger, focus, panel, positive, primary, qrHref, screen, secondary, topUpHref, warning } from "./styles";

export function CreditsExplainer({ openByDefault, minimum, rate }: {
  openByDefault: boolean; minimum: number; rate: number;
}) {
  const [open, setOpen] = useState(openByDefault);
  return <details open={open} onToggle={event => setOpen(event.currentTarget.open)}
    className="group rounded-2xl border border-[#E3EEF9] bg-white">
    <summary aria-expanded={open} className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-4 py-2 font-heading font-bold [&::-webkit-details-marker]:hidden ${focus}`}>
      How credits work <ChevronDown size={18} aria-hidden className="shrink-0 text-[#0A47B1] group-open:rotate-180" />
    </summary>
    <ol className="space-y-2 px-4 pb-4 pt-1 text-sm text-[#5B6F89]">
      {creditSteps("en", minimum, rate).map((line, index) => <li key={line} className="flex items-start gap-2">
        <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-[#EAF4FF] text-xs font-semibold text-[#0A47B1]">{index + 1}</span>
        <span className="pt-0.5">{line}</span>
      </li>)}
    </ol>
  </details>;
}

export function MobilePaymentResult({ order, available, visible }: {
  order: TopUpResult; available: number; visible: boolean;
}) {
  const [copyMessage, setCopyMessage] = useState("");
  const paid = order.status === "paid";
  const waiting = order.status === "created";
  const reviewing = order.status === "needs_review";
  const incomplete = !paid && !waiting && !reviewing;
  const Icon = paid ? Check : incomplete ? CircleAlert : Clock;
  const title = paid ? `${paymentPeso(order.amount)} added`
    : waiting ? "Waiting for confirmation"
    : reviewing ? "We’re checking your payment"
    : "Payment not completed";
  const description = paid ? `New balance ${paymentPeso(available)}.${visible ? " Your vehicles are visible." : ""}`
    : waiting ? "This usually takes under a minute. You can leave this page."
    : reviewing ? "We received your payment and are confirming it. Credits are added once it is confirmed."
    : "This payment was not finished. Check your payment app before trying again.";

  async function copyOrder() {
    try {
      await navigator.clipboard.writeText(order.orderId);
      setCopyMessage("Order number copied.");
    } catch {
      setCopyMessage("Could not copy. You can select the order number above.");
    }
  }

  return <div className={screen}>
    <CreditsHeading back="Credits" href={creditsHref} title="Payment status" description="Track your online top-up." />
    <section className={`${panel} space-y-4`}>
      <div role="status" aria-atomic="true" className="space-y-2">
        <span className={`grid size-11 place-items-center rounded-full ${paid ? positive : incomplete ? danger : warning}`}><Icon size={23} aria-hidden /></span>
        <h2 className="break-words font-heading text-xl font-bold">{title}</h2>
        <p className="break-words text-sm text-[#5B6F89]">{description}</p>
      </div>
      {!paid && <div className="rounded-xl bg-[#F3F9FF] px-3 py-2 text-sm">
        <p className="break-words">{paymentPeso(order.amount)} · {channelLabel(order.method)}</p>
        <div className="flex flex-wrap items-center gap-x-2">
          <span className="break-all font-semibold">{order.orderId}</span>
          <button type="button" onClick={copyOrder} aria-label="Copy order number"
            className={`grid size-11 place-items-center rounded-lg text-[#0A47B1] ${focus}`}><Clipboard size={18} aria-hidden /></button>
        </div>
        <p role="status" className="text-xs text-[#5B6F89]">{copyMessage}</p>
      </div>}
      {incomplete ? <div className="space-y-2">
        <Link href={topUpHref} className={primary}>Try again</Link>
        <Link href={`${qrHref}?amount=${order.amount}`} className={secondary}>Pay by QR instead</Link>
      </div> : <Link href={creditsHref} className={primary}>{paid ? "Done" : "Back to credits"}</Link>}
    </section>
    {!paid && <p className="text-center text-sm text-[#5B6F89]">
      Paid but no credits after 10 minutes?{" "}
      <Link href="/contact" className={`inline-flex min-h-11 items-center rounded-lg font-semibold text-[#0A47B1] underline ${focus}`}>Contact support</Link>
      {" "}with your order number.
    </p>}
  </div>;
}
