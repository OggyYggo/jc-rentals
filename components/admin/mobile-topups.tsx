"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AdminFilterChips, adminManilaDate, mobileAction, mobilePrimaryAction } from "./ui";
import { onlineTopupLabels, onlineTopupStatus, type OnlineTopupRow } from "./online-topups";
import { topupTransferMatches, useReviewTopup, useTopupProofs, type Topup } from "./payment-admin";
import { normalizePaymentReference, paymentPeso } from "@/lib/payment-format";
import { Dialog } from "@/components/ui/dialog";
import { ResponsiveSheet } from "@/components/ui/responsive-sheet";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";

const card = "space-y-2 rounded-2xl border border-[#D6E6F7] bg-white p-4 text-sm text-[#0F2342]";
const field = "mt-1 min-h-11 w-full rounded-lg border border-[#D6E6F7] px-3 focus-visible:outline-2 focus-visible:outline-[#0A47B1]";
const onlineFilters = [{ value: "all", label: "All" }, { value: "needs_review", label: "Needs review" },
  { value: "paid", label: "Paid" }, { value: "waiting", label: "Waiting" }];
const historyFilters = [{ value: "all", label: "All" }, { value: "posted", label: "Verified" }, { value: "rejected", label: "Rejected" }];

function setQuery(key: string, value: string) {
  const url = new URL(window.location.href);
  if (url.searchParams.get(key) === value) return;
  url.searchParams.set(key, value);
  if (key === "tab") url.searchParams.delete("filter");
  window.history.pushState(null, "", url);
}

export function MobileTopups({ rows, history, historyAvailable, online, onlineAvailable }: {
  rows: Topup[]; history: Topup[]; historyAvailable: boolean; online: OnlineTopupRow[]; onlineAvailable: boolean;
}) {
  const query = useSearchParams();
  const requested = query.get("tab");
  const tab = requested === "online" || requested === "history" ? requested : "pending";
  const requestedFilter = query.get("filter");
  const filters = tab === "online" ? onlineFilters : historyFilters;
  const filter = filters.find(option => option.value === requestedFilter)?.value ?? "all";
  const urls = useTopupProofs(rows, history, tab, "mobile");
  const { busy, review } = useReviewTopup();
  const [selected, setSelected] = useState<Topup | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const filteredOnline = (value: string) => online.filter(row => {
    const status = onlineTopupStatus(row);
    return value === "all" || status === value || (value === "waiting" && ["created", "failed", "expired"].includes(status));
  });
  const filteredHistory = (value: string) => history.filter(row => value === "all" || row.status === value);
  const tabs = [{ key: "pending", label: `To verify ${rows.length}` }, { key: "online", label: onlineAvailable ? `Online ${online.length}` : "Online" }, { key: "history", label: "History" }] as const;
  return <div className="font-body text-[#0F2342] lg:hidden">
    <header className="mb-4">
      <h1 className="font-heading text-2xl font-bold">Owner top-ups</h1>
      <p className="mt-1 text-sm text-[#5B6F89]">Credits that owners paid for.</p>
    </header>
    <SegmentedTabs label="Owner top-ups" tabs={tabs} value={tab} onChange={value => setQuery("tab", value)}>
      <div className="space-y-3">
        {tab === "pending" && <>
          <p className="rounded-xl bg-[#EAF4FF] p-3 text-[13px] text-[#0A3D91]">Open your GCash or Maya app and check the money arrived before you verify.</p>
          {!rows.length && <p className={card}>No top-ups waiting for review.</p>}
          {rows.map(row => <ManualCard key={row.id} row={row} url={urls[row.id]}>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={mobilePrimaryAction} disabled={Boolean(busy)} onClick={event => {
                trigger.current = event.currentTarget;
                setSelected(row);
              }}>Verify</button>
              <button type="button" className={`${mobileAction} text-[#A12A2A]`} disabled={Boolean(busy)}
                onClick={() => void review(row, false)}>Reject</button>
            </div>
          </ManualCard>)}
        </>}
        {tab === "online" && (!onlineAvailable ? <p className={card}>Could not load online top-ups.</p> : <>
          <AdminFilterChips label="Online payment status" value={filter}
            options={onlineFilters.map(option => ({ ...option, count: filteredOnline(option.value).length }))}
            onChange={value => setQuery("filter", value)} />
          {filteredOnline(filter).map(row => <OnlineCard key={row.order_id} row={row} />)}
          {!filteredOnline(filter).length && <p className={card}>{online.length ? "No online top-ups match this filter." : "No online top-ups yet."}</p>}
        </>)}
        {tab === "history" && (!historyAvailable ? <p className={card}>Could not load top-up history.</p> : <>
          <AdminFilterChips label="Manual top-up history" value={filter}
            options={historyFilters.map(option => ({ ...option, count: filteredHistory(option.value).length }))}
            onChange={value => setQuery("filter", value)} />
          {filteredHistory(filter).map(row => <ManualCard key={row.id} row={row} url={urls[row.id]}>
            <p className="font-semibold">{row.status === "posted" ? "Verified" : "Rejected"}</p>
          </ManualCard>)}
          {!filteredHistory(filter).length && <p className={card}>No top-ups match this filter.</p>}
        </>)}
      </div>
    </SegmentedTabs>
    {selected && <VerifySheet row={selected} url={urls[selected.id]} close={() => setSelected(null)}
      trigger={trigger} verify={transfer => { setSelected(null); void review(selected, true, transfer, true); }} />}
  </div>;
}

function ManualCard({ row, url, children }: { row: Topup; url?: string; children: React.ReactNode }) {
  return <article className={card}>
    <h2 className="break-words font-heading font-semibold">{row.owner?.business_name ?? row.owner_id}</h2>
    <time dateTime={row.created_at} className="block text-[13px] text-[#5B6F89]">{adminManilaDate(row.created_at)}</time>
    <p className="break-words font-heading text-2xl font-bold tabular-nums">{paymentPeso(Number(row.amount))}</p>
    <p className="break-all text-[#5B6F89]">Reference · {row.reference_no || "—"}</p>
    {url && <a href={url} target="_blank" rel="noreferrer" className={`${mobileAction} w-fit gap-2`}>
      <Image src={url} alt="" width={48} height={48} unoptimized className="size-10 rounded object-contain" />View proof
    </a>}
    {children}
  </article>;
}

function VerifySheet({ row, url, trigger, close, verify }: {
  row: Topup; url?: string; trigger: React.RefObject<HTMLButtonElement | null>; close: () => void;
  verify: (transfer: { amount: string; reference: string }) => void;
}) {
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [checked, setChecked] = useState(false);
  const matched = topupTransferMatches(row, { amount, reference }, url);
  const amountMismatch = amount !== "" && Number(amount) !== Number(row.amount);
  const referenceMismatch = reference !== "" && normalizePaymentReference(reference) !== normalizePaymentReference(row.reference_no ?? "");
  return <Dialog.Root open onOpenChange={open => { if (!open) close(); }}>
    <ResponsiveSheet finalFocus={trigger} desktopFrom="lg">
      <Dialog.Title className="break-words font-heading text-xl font-bold">Add {paymentPeso(Number(row.amount))} to {row.owner?.business_name ?? "this owner"}?</Dialog.Title>
      <Dialog.Description className="mt-2 break-all text-[#5B6F89]">Owner’s reference · {row.reference_no || "—"}</Dialog.Description>
      <form className="mt-4 space-y-3" onSubmit={event => {
        event.preventDefault();
        if (checked && matched) verify({ amount, reference });
      }}>
        <label className="block font-semibold">Amount received<input className={field} type="number" inputMode="decimal"
          min="0.01" step="0.01" required value={amount} onChange={event => setAmount(event.target.value)} /></label>
        <label className="block font-semibold">Reference from your app<input className={field} maxLength={100}
          required value={reference} onChange={event => setReference(event.target.value)} /></label>
        {!url && <p className="text-[#8A5A00]">The payment proof must be available before you can verify.</p>}
        {(amountMismatch || referenceMismatch) && <p role="status" className="break-all rounded-lg bg-[#FFF2D6] p-3 text-[#8A5A00]">
          {amountMismatch ? `The owner claimed ${paymentPeso(Number(row.amount))}. The received amount must match.` : "The reference must match the one the owner submitted."}
        </p>}
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={checked} required
          onChange={event => setChecked(event.target.checked)} />I saw this payment in my own app.</label>
        <p className="text-[#5B6F89]">Saved to the audit log.</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Dialog.Close className={mobileAction}>Cancel</Dialog.Close>
          <button className={mobilePrimaryAction} disabled={!matched || !checked}>Verify and add credits</button>
        </div>
      </form>
    </ResponsiveSheet>
  </Dialog.Root>;
}

function OnlineCard({ row }: { row: OnlineTopupRow }) {
  const status = onlineTopupStatus(row);
  const labels = onlineTopupLabels(row);
  const needsReview = status === "needs_review";
  return <article className={card}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <h2 className="min-w-0 break-words font-heading font-semibold">{row.owner?.business_name ?? row.owner_id}</h2>
      <div className="flex flex-wrap gap-1">
        <span className={`rounded-full px-2.5 py-1 text-[13px] font-semibold ${needsReview ? "bg-[#FFF2D6] text-[#8A5A00]" : status === "paid" ? "bg-[#E3F7EA] text-[#12703A]" : "bg-[#EAF4FF] text-[#0A3D91]"}`}>{labels.status}</span>
        {!row.livemode && <span className="rounded-full bg-[#FFF2D6] px-2.5 py-1 text-[13px] font-semibold text-[#8A5A00]">Test</span>}
      </div>
    </div>
    <p className="text-[13px] text-[#5B6F89]">{labels.method} · {labels.provider} · <time dateTime={row.created_at}>{adminManilaDate(row.created_at)}</time></p>
    <p className="break-words font-heading text-2xl font-bold tabular-nums">{paymentPeso(Number(row.amount))}</p>
    <p className="break-all text-[#5B6F89]">Order · {row.order_id}</p>
    <p>{status === "paid" ? "Credits were added automatically. Nothing to do."
      : needsReview ? `Check the payment in ${labels.provider} and review the owner’s credits before making any adjustment.`
        : status === "expired" ? "Expired. No money received." : "No money received yet."}</p>
    {needsReview && <Link className={mobileAction} href={`/admin/owners/${row.owner_id}`}>Open owner</Link>}
  </article>;
}
