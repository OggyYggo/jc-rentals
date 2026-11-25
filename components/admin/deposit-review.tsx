"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState, useSyncExternalStore, type ComponentProps } from "react";
import { OwnerPaymentReview } from "@/components/owner/payment-review";
import { mobileAction, mobileCard, mobilePrimaryAction } from "@/components/admin/ui";
import { paymentPeso } from "@/lib/payment-format";
import { paymentProviders } from "@/lib/payments/providers";

type Payment = ComponentProps<typeof OwnerPaymentReview>["payments"][number] & {
  owner_id: string;
  owner: { business_name: string } | null;
};

const desktopQuery = "(min-width: 64rem)";
function subscribe(onChange: () => void) {
  const media = window.matchMedia(desktopQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function isDesktop() {
  return window.matchMedia(desktopQuery).matches;
}

export function AdminDepositReview({ payments, renderedAt }: { payments: Payment[]; renderedAt: number }) {
  const desktop = useSyncExternalStore(subscribe, isDesktop, () => true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [now, setNow] = useState(renderedAt);
  useEffect(() => {
    if (desktop || !payments.length) return;
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [desktop, payments.length]);

  if (!payments.length) return <OwnerPaymentReview admin payments={payments}/>;
  if (desktop) return <div className="hidden lg:contents"><OwnerPaymentReview admin payments={payments}/></div>;
  return <div className="space-y-3">{payments.map(payment => <DepositCard
    key={payment.id} payment={payment} now={now} expanded={payment.id === expanded}
    toggle={() => setExpanded(current => current === payment.id ? null : payment.id)}
  />)}</div>;
}

function DepositCard({ payment, now, expanded, toggle }: {
  payment: Payment; now: number; expanded: boolean; toggle: () => void;
}) {
  const detailsId = useId();
  const reviewRows = useMemo(() => [payment], [payment]);
  const reference = payment.booking?.reference ?? payment.booking_id;
  const option = payment.payment_label || (payment.payment_provider && paymentProviders[payment.payment_provider]?.label);
  const flags = new Set([...(payment.flags ?? []), ...(payment.booking?.payment_flags ?? [])]);
  const due = payment.booking?.review_due_at;
  const seconds = due ? (Date.parse(due) - now) / 1000 : null;
  const minutes = seconds === null ? 0 : Math.ceil(seconds / 60);
  const timeLeft = seconds === null ? null : seconds <= 0 ? "Deadline passed"
    : minutes < 60 ? `${minutes}m left` : `${Math.floor(minutes / 60)}h ${minutes % 60}m left`;

  return <article className={mobileCard}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <h2 className="text-xl font-semibold tabular-nums">{paymentPeso(payment.amount)}</h2>
      {timeLeft && <span className={`rounded-full px-2 py-1 text-[13px] font-semibold ${seconds !== null && seconds < 3600 ? "bg-[#FDE8E8] text-[#A12A2A]" : "bg-[#FFF2D6] text-[#8A5A00]"}`}>{timeLeft}</span>}
    </div>
    <p className="mt-1 break-words text-[#5B6F89]">{reference} · {payment.owner?.business_name ?? "Rental owner"}</p>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {option && <span className="inline-flex items-center gap-2 rounded-lg bg-[#F3F9FF] px-2 py-1 font-semibold text-[#0A47B1]">
        <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-md bg-[#EAF4FF]">{option.trim().slice(0, 1).toUpperCase()}</span>{option}
      </span>}
      {flags.size > 0 && <span className="rounded-full bg-[#FFF2D6] px-2 py-1 text-[13px] font-semibold text-[#8A5A00]">{flags.size} {flags.size === 1 ? "flag" : "flags"}</span>}
    </div>
    <div className="mt-3 flex flex-wrap justify-between gap-2">
      <button type="button" onClick={toggle} aria-controls={detailsId} aria-expanded={expanded} className={mobilePrimaryAction}>{expanded ? "Close review" : "Review deposit"}</button>
      <Link href={`/admin/owners/${payment.owner_id}`} className={mobileAction}>Owner</Link>
    </div>
    <div id={detailsId} hidden={!expanded} className="admin-deposit-review mt-3">
      <OwnerPaymentReview admin payments={reviewRows}/>
    </div>
  </article>;
}
