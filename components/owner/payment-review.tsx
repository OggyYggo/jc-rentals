"use client";
import { paymentProviders, type PaymentProvider } from "@/lib/payments/providers";


import { useConnectionStatus } from "@/lib/connection/provider";
import { connectionError, fetchWithTimeout, withConnectionDeadline } from "@/lib/connection/request";
import { runWithAlerts } from "@/lib/alerts/run";
import { normalizePaymentReference, paymentDate, paymentPeso } from "@/lib/payment-format";
import { createClient } from "@/lib/supabase/client";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, Check, ChevronDown, TriangleAlert } from "lucide-react";
import { SubmitButton } from "@/components/loading/SubmitButton";
import { OwnerDepositCard, PaymentQueueBadge, PaymentQueueCard, PaymentQueueEmpty } from "./payment-queue-card";
import "./deposit-page-slide.css";

type Payment = {
  payment_label?: string | null; payment_provider?: PaymentProvider | null;
  id: string; booking_id: string; amount: number; reference_no: string; proof_path: string; paid_at: string;
  proof_sha256: string | null; flags: string[];
  booking: { reference: string; review_due_at: string | null; payment_flags: string[]; car: { brand: string; model: string } | null } | null;
};

export function OwnerPaymentReview({ payments, admin = false }: { payments: Payment[]; admin?: boolean }) {
  const router = useRouter();
  const offline = useConnectionStatus() === "offline";
  const [uncertainPayments, setUncertainPayments] = useState<string[]>([]);
  const [listRef] = useAutoAnimate<HTMLDivElement>({ duration: 180 });
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [inputs, setInputs] = useState<Record<string, { amount: string; reference: string }>>({});
  const [busy, setBusy] = useState("");
  const [now, setNow] = useState<number | null>(null);
  const [selectedDeposit, setSelectedDeposit] = useState<string>();
  const [detailOpen, setDetailOpen] = useState(false);
  const reviewTrigger = useRef<HTMLButtonElement | null>(null);
  const depositDetail = useRef<HTMLElement | null>(null);
  const selectedPayment = payments.find(payment => payment.id === selectedDeposit);
  const showDetail = detailOpen && Boolean(selectedPayment);

  useLayoutEffect(() => {
    if (showDetail) {
      const detail = depositDetail.current;
      if (detail?.getClientRects().length) {
        detail.focus({ preventScroll: true });
        detail.scrollIntoView({ block: "start" });
      }
    } else {
      const trigger = reviewTrigger.current;
      if (trigger?.getClientRects().length) trigger.focus();
    }
  }, [showDetail, selectedDeposit]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const db = createClient();
    for (const payment of payments) {
      void db.storage.from("payment-proofs").createSignedUrl(payment.proof_path, 300).then(({ data }) => {
        if (active && data?.signedUrl) setUrls((current) => ({ ...current, [payment.id]: data.signedUrl }));
      });
      if (!payment.proof_sha256) {
        void fetch(`/api/payments/${payment.id}/fingerprint`, { method: "POST" })
          .then(async (response) => {
            if (response.ok && (await response.json()).updated && active) router.refresh();
          }).catch(() => {});
      }
    }
    return () => { active = false; };
  }, [payments, router]);

  function review(payment: Payment, approve: boolean) {
    if (offline || uncertainPayments.includes(payment.id)) return;
    async function send<T>(request: (signal: AbortSignal) => PromiseLike<{ data: T; error: unknown }>) {
      try {
        const { data, error } = await withConnectionDeadline(request);
        if (error) throw error;
        return data;
      } catch (error) {
        if (connectionError(error)?.sent) setUncertainPayments(current => [...current, payment.id]);
        throw error;
      }
    }
    return runWithAlerts<void>({
      connection: {
        reference: payment.booking?.reference ?? payment.reference_no,
        amount: payment.amount,
        checkStatus: async () => {
          const { data, error } = await withConnectionDeadline(signal => createClient().from("payments")
            .select("status").eq("id", payment.id).abortSignal(signal).maybeSingle(), 15_000);
          return !error && data?.status === (approve ? "verified" : "rejected")
            ? { state: "found", data: undefined } : { state: "unknown" };
        },
      },
      confirm: approve ? {
        title: admin ? "Confirm on behalf of the owner?" : "Confirm this payment?",
        text: `Record the ${paymentPeso(payment.amount)} reservation payment for ${payment.booking?.reference ?? "this booking"}.`,
        confirmText: "Confirm payment",
      } : undefined,
      reason: approve ? (admin ? {
        title: "Why are you confirming on behalf of the owner?", label: "Audit reason", minLength: 10, confirmText: "Continue",
      } : undefined) : {
        title: "Reject this proof?",
        text: "The customer can upload a replacement when time and attempts remain.",
        label: "Reason shown to the customer", confirmText: "Reject proof",
        choices: ["Amount not received", "Different amount", "Wrong account", "Unclear proof"],
      },
      setPending: (pending) => setBusy(pending ? payment.id : ""),
      run: async (reason) => {
        const db = createClient();
        if (!approve) {
          await send(signal => db.rpc("reject_booking_payment", { p_payment_id: payment.id, p_reason: reason }).abortSignal(signal));
          return;
        }
        if (!payment.proof_sha256) await fetchWithTimeout(`/api/payments/${payment.id}/fingerprint`, { method: "POST" }).catch(() => {});
        const data = await send(signal => db.rpc("confirm_booking_payment", {
          p_payment_id: payment.id,
          p_received_amount: admin ? null : Number(inputs[payment.id]?.amount),
          p_received_reference: admin ? null : inputs[payment.id]?.reference,
          p_admin_note: admin ? reason : null,
        }).abortSignal(signal));
        if (data === "CREDITS_SHORT") {
          router.refresh();
          throw new Error("Top up your owner credits to confirm this payment. The booking is still in review.");
        }
      },
      success: approve ? "Payment confirmed" : "Payment proof rejected",
      refresh: router.refresh,
    });
  }

  if (!payments.length) return admin
    ? <p className="rounded-xl border bg-white p-10 text-center text-sm text-slate-500">No deposits waiting for review.</p>
    : <PaymentQueueEmpty>No deposits waiting for review.</PaymentQueueEmpty>;
  const rows = payments.map((payment) => {
    const input = inputs[payment.id] ?? { amount: "", reference: "" };
    const reference = normalizePaymentReference(payment.reference_no ?? "");
    const matches = input.amount !== "" && Number(input.amount) === Number(payment.amount)
      && reference !== "" && normalizePaymentReference(input.reference) === reference;
    const deadline = payment.booking?.review_due_at;
    const minutes = deadline && now !== null ? Math.ceil((Date.parse(deadline) - now) / 60000) : null;
    const flags = [...new Set([...(payment.flags ?? []), ...(payment.booking?.payment_flags ?? [])])];
    const bookingRef = payment.booking?.reference ?? payment.booking_id;
    const deadlineText = deadline ? `Review by ${paymentDate(deadline)} Manila time` : null;
    const timeLeft = minutes === null ? null : minutes > 0 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m left` : "Deadline passed";
    if (admin) {
      const proof = urls[payment.id] ? <a href={urls[payment.id]} target="_blank" rel="noreferrer" >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={urls[payment.id]} alt="Customer payment proof" className="max-h-56 rounded-lg object-contain" />
    </a> : <p className="text-sm text-slate-600">Proof image unavailable</p>;

    const reviewControls = <div className="min-w-0">
        <h2 className="font-semibold">{bookingRef}</h2>
        <p className="mt-1 break-all text-sm text-slate-700">{admin && `${paymentPeso(payment.amount)} · `}Transfer reference <strong>{payment.reference_no}</strong></p>
        {payment.payment_label && <p className="mt-1 break-words text-sm text-slate-700">
          Payment option · <strong>{payment.payment_label}</strong>
          {payment.payment_provider && paymentProviders[payment.payment_provider].label !== payment.payment_label
            && " (" + paymentProviders[payment.payment_provider].label + ")"}
        </p>}
        {deadlineText && <p className="text-sm text-slate-600">{deadlineText}{timeLeft && ` · ${timeLeft}`}</p>}
        <div className="mt-2 flex flex-wrap gap-2">{flags.map((flag) => <span key={flag} className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-950">{flag.replaceAll("_", " ")}</span>)}</div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button disabled={!!busy || offline || uncertainPayments.includes(payment.id)} onClick={() => review(payment, true)} className="rounded-lg bg-green-700 px-3 py-3 text-sm text-white disabled:opacity-50">{busy === payment.id ? "Working…" : offline ? "Needs internet to continue" : "Confirm on behalf of owner"}</button>
          <button disabled={!!busy || offline || uncertainPayments.includes(payment.id)} onClick={() => review(payment, false)} className="rounded-lg border px-3 py-3 text-sm text-red-700">Reject proof</button>
        </div>
      </div>;

      return { desktop: <article key={payment.id} className="grid gap-5 rounded-xl border bg-white p-5 md:grid-cols-[180px_minmax(0,1fr)]">{proof}{reviewControls}</article> };
    }

    const amount = paymentPeso(payment.amount);
    const car = payment.booking?.car;
    const bookingLabel = car ? `${car.brand} ${car.model} \u00b7 ${bookingRef}` : bookingRef;
    const flagLabel = flags.length ? `${flags.length} ${flags.length === 1 ? "flag" : "flags"}` : undefined;
    const urgent = minutes !== null && deadline && now !== null && Date.parse(deadline) - now < 3_600_000;
    const compactTime = minutes !== null && minutes > 0 && minutes < 60 ? `${minutes}m left` : timeLeft;
    const timeChip = compactTime && <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${urgent ? "bg-[#FDE8E8] text-[#A12A2A]" : "bg-[#FFF2D6] text-[#8A5A00]"}`}>{compactTime}</span>;
    const selected = selectedPayment?.id === payment.id;
    const formProps = {
      amount: payment.amount, reference: payment.reference_no, option: payment.payment_label, url: urls[payment.id],
      input, matches, flags, flagLabel, disabled: Boolean(busy) || uncertainPayments.includes(payment.id), working: busy === payment.id,
      expired: minutes !== null && minutes <= 0,
      onChange: (key: "amount" | "reference", value: string) => setInputs(current => ({
        ...current, [payment.id]: { ...(current[payment.id] ?? input), [key]: value },
      })),
      onReview: (approve: boolean) => review(payment, approve),
    };

    return {
      detail: selected ? <section key={payment.id} ref={depositDetail} tabIndex={-1} aria-label="Review deposit" className="min-w-0 scroll-mt-24 space-y-3 font-body text-[#0F2342] focus:outline-none">
          <button type="button" onClick={() => setDetailOpen(false)} disabled={Boolean(busy)} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-[#0A3D91] focus-visible:outline-2 disabled:opacity-50">
            <ArrowLeft size={17} aria-hidden="true" /> Deposits
          </button>
          <header className="space-y-1 rounded-2xl bg-[#0A47B1] p-4 text-white">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <h2 className="font-heading text-sm font-semibold">Deposit to confirm</h2>{timeChip}
            </div>
            <p className="break-words font-heading text-[30px] font-bold tabular-nums">{amount}</p>
            <p className="break-words text-sm text-[#EAF4FF]">{bookingLabel}</p>
          </header>
          {deadline && <p className="px-1 text-xs text-[#5B6F89]">Review by {reviewDeadline(deadline)}</p>}
          <OwnerDepositDetails {...formProps} />
        </section> : null,
      card: <OwnerDepositCard key={payment.id} amount={amount} booking={bookingLabel} timeLeft={timeChip} option={payment.payment_label} flags={flagLabel}
        onReview={(event) => {
          reviewTrigger.current = event.currentTarget;
          setSelectedDeposit(payment.id);
          setDetailOpen(true);
        }} />,
      desktop: <PaymentQueueCard key={payment.id} title={bookingLabel} amount={amount}
          badge={timeChip || <PaymentQueueBadge label="Needs review" tone="amber" />}
          detail={deadline && <span>Review by {reviewDeadline(deadline)}</span>}
          action="Review deposit">
          <OwnerDepositDetails {...formProps} />
        </PaymentQueueCard>,
    };
  });

  if (admin) return <div ref={listRef} className="space-y-4">{rows.map(row => row.desktop)}</div>;
  return <>
    <div className="t-page-slide md:hidden" data-page={showDetail ? "2" : "1"}>
      <div className="t-page space-y-4" data-page-id="1" inert={showDetail}>
        {rows.map(row => row.card)}
      </div>
      <div className="t-page" data-page-id="2" inert={!showDetail}>
        {rows.find(row => row.detail)?.detail}
      </div>
    </div>
    <div ref={listRef} className="hidden space-y-4 md:block">{rows.map(row => row.desktop)}</div>
  </>;
}

const deadlineDay = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric" });
const deadlineClock = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
function reviewDeadline(value: string) {
  const date = new Date(value);
  return `${deadlineDay.format(date)}, ${deadlineClock.format(date)}`;
}

function OwnerDepositDetails({ amount, reference, option, url, input, matches, flags, flagLabel, disabled, working, expired, onChange, onReview }: {
  amount: number; reference: string; option?: string | null; url?: string;
  input: { amount: string; reference: string }; matches: boolean; flags: string[]; flagLabel?: string;
  disabled: boolean; working: boolean; expired: boolean;
  onChange: (key: "amount" | "reference", value: string) => void;
  onReview: (approve: boolean) => void;
}) {
  const [brokenUrl, setBrokenUrl] = useState<string>();
  const proofUrl = url !== brokenUrl ? url : undefined;
  const amountMatches = input.amount !== "" && Number(input.amount) === Number(amount);
  const expectedReference = normalizePaymentReference(reference ?? "");
  const referenceMatches = expectedReference !== "" && normalizePaymentReference(input.reference) === expectedReference;
  const field = "mt-1 min-h-11 w-full min-w-0 rounded-lg border border-[#D6E6F7] px-3 pr-9 text-base focus-visible:outline-2 focus-visible:outline-[#0A47B1] lg:text-sm";
  const check = <Check size={18} aria-hidden="true" className="pointer-events-none absolute right-2.5 top-4 text-[#12703A]" />;
  const proofText = <>
    {option && <p className="break-words text-sm text-[#5B6F89]">{option}</p>}
    <p className="break-all text-sm text-[#5B6F89]">Ref <span className="font-semibold text-[#0F2342]">{reference}</span></p>
  </>;
  return <div className="grid min-w-0 items-start gap-3 lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-6">
    <div className="flex min-w-0 items-start gap-3 rounded-2xl border border-[#D6E6F7] bg-white p-3 md:hidden">
      {proofUrl && <a href={proofUrl} target="_blank" rel="noreferrer" aria-label="Open customer proof in a new tab" className="block size-[84px] shrink-0 rounded-lg bg-[#F3F9FF] focus-visible:outline-2 focus-visible:outline-[#0A47B1]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={proofUrl} alt="Customer payment proof" onError={() => setBrokenUrl(proofUrl)} className="size-full rounded-lg object-contain" />
      </a>}
      <div className="min-w-0">
        <h3 className="font-heading text-sm font-bold text-[#0F2342]">Customer&apos;s proof</h3>
        {proofText}
        {proofUrl ? <a href={proofUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 rounded text-sm font-semibold text-[#0A47B1] focus-visible:outline-2">View proof <ArrowUpRight size={15} aria-hidden="true" /></a>
          : <p className="mt-1 text-sm text-[#5B6F89]">Proof image unavailable</p>}
      </div>
    </div>

    <div className="hidden md:block">
      {proofUrl ? <a href={proofUrl} target="_blank" rel="noreferrer" className="block rounded-xl border border-[#dce5f1] bg-[#f8fbff] p-2 text-sm font-semibold text-[#214a86] focus-visible:outline-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={proofUrl} alt="Customer payment proof" onError={() => setBrokenUrl(proofUrl)} className="max-h-52 w-full rounded-lg object-contain" />
        <span className="mt-2 inline-flex min-h-11 items-center gap-1">View proof <ArrowUpRight size={14} aria-hidden="true" /></span>
      </a> : <p className="text-sm text-slate-600">Proof image unavailable</p>}
    </div>

    <div className="min-w-0 space-y-3">
      <div className="hidden md:block">{proofText}</div>
      <div className="min-w-0 rounded-2xl border border-[#D6E6F7] bg-white p-3 md:rounded-none md:border-0 md:p-0">
        <h3 className="font-heading text-sm font-bold text-[#0F2342]">What you received</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="min-w-0 text-sm">Amount<span className="relative block">
            <input type="number" min="0" step="0.01" inputMode="decimal" disabled={disabled} value={input.amount} onChange={event => onChange("amount", event.target.value)} className={field} />
            {amountMatches && check}
          </span></label>
          <label className="min-w-0 text-sm">Reference<span className="relative block">
            <input disabled={disabled} value={input.reference} onChange={event => onChange("reference", event.target.value)} className={field} />
            {referenceMatches && check}
          </span></label>
        </div>
        <p role="status" aria-live="polite" className={`mt-2 text-sm font-semibold ${matches ? "text-[#12703A]" : "text-[#8A5A00]"}`}>
          {matches ? "Amount and reference match" : input.amount !== "" || input.reference !== "" ? "Check amount and reference" : ""}
        </p>
      </div>

      {flagLabel && <details className="group rounded-xl border border-[#D6E6F7] bg-white px-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded text-sm font-semibold text-[#8A5A00] focus-visible:outline-2 [&::-webkit-details-marker]:hidden">
          <TriangleAlert size={16} aria-hidden="true" /> {flagLabel} <span aria-hidden="true">&middot;</span> <span className="group-open:hidden">Show</span><span className="hidden group-open:inline">Hide</span>
          <ChevronDown size={16} aria-hidden="true" className="ml-auto group-open:rotate-180" />
        </summary>
        <div className="flex flex-wrap gap-2 pb-3">{flags.map(flag => <span key={flag} className="break-all rounded-full bg-[#FFF2D6] px-2 py-1 text-xs text-[#8A5A00]">{flag.replaceAll("_", " ")}</span>)}</div>
      </details>}

      <div className="grid gap-2 md:flex md:flex-wrap">
        <SubmitButton type="button" unstyled busy={working} disabled={disabled || !matches || expired} onClick={() => onReview(true)} pendingText="Working..."
          className="min-h-11 rounded-xl bg-[#12703A] px-3 py-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12703A] disabled:opacity-50 md:rounded-lg md:bg-green-700 md:font-normal">Confirm payment</SubmitButton>
        <SubmitButton type="button" unstyled busy={working} disabled={disabled} onClick={() => onReview(false)} pendingText="Working..."
          className="min-h-11 rounded-xl border border-[#D6E6F7] px-3 py-3 text-sm font-semibold text-[#A12A2A] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 md:rounded-lg md:font-normal md:text-red-700">Reject proof</SubmitButton>
      </div>
    </div>
  </div>;
}
