"use client";

import { ArrowDownLeft, ArrowUpRight, RefreshCcw, SlidersHorizontal, Wallet } from "lucide-react";
import { useState } from "react";
import { paymentPeso } from "@/lib/payment-format";
import { channelLabel, creditDate, creditMonth, type CreditActivityRow } from "./data";
import { chip, danger, positive, secondary, warning } from "./styles";

const filters = ["All", "Top-ups", "Fees"] as const;
const pageSize = 20;

function description(row: CreditActivityRow) {
  const date = creditDate(row.created_at);
  const reference = row.booking?.reference;
  const car = row.booking?.car;
  const charge = Math.abs(Number(row.amount));

  switch (row.type) {
    case "topup": {
      if (row.status === "pending") return {
        title: "Top-up waiting", subtitle: `QR + proof · ${date}`, icon: ArrowDownLeft,
        chip: "Waiting", tone: warning, amount: `+${paymentPeso(charge)}`, color: "text-[#8A5A00]",
      };
      if (row.status === "rejected") return {
        title: "Top-up not approved", subtitle: [row.note?.trim(), date].filter(Boolean).join(" · "), icon: ArrowDownLeft,
        chip: "Not approved", tone: danger, amount: paymentPeso(charge), color: "text-[#5B6F89] line-through",
      };
      const online = row.online || row.note?.startsWith("Online top-up");
      return {
        title: "Top-up added", icon: ArrowDownLeft, chip: "Added", tone: positive,
        subtitle: online
          ? ["Online", row.online && channelLabel(row.online.method), creditDate(row.created_at, true)].filter(Boolean).join(" · ")
          : `QR payment · ${date}`,
        amount: `+${paymentPeso(charge)}`, color: "text-[#12703A]",
      };
    }
    case "booking_fee":
      return {
        title: "Platform fee", icon: ArrowUpRight, amount: `−${paymentPeso(charge)}`,
        subtitle: [reference, car && `${car.brand} ${car.model}`, date].filter(Boolean).join(" · "),
      };
    case "fee_refund":
      return {
        title: "Fee refunded", icon: RefreshCcw, amount: `+${paymentPeso(charge)}`, color: "text-[#12703A]",
        subtitle: [reference && `${reference} cancelled`, date].filter(Boolean).join(" · "),
      };
    default:
      return {
        title: "Adjustment", icon: SlidersHorizontal, subtitle: `${row.note || "Admin adjustment"} · ${date}`,
        amount: `${Number(row.amount) < 0 ? "−" : "+"}${paymentPeso(charge)}`,
      };
  }
}

export function CreditActivity({ rows }: { rows: CreditActivityRow[] }) {
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const [count, setCount] = useState(pageSize);
  const filtered = rows.filter(row => filter === "All" ||
    (filter === "Top-ups" ? row.type === "topup" : row.type === "booking_fee" || row.type === "fee_refund"));
  const groups = new Map<string, CreditActivityRow[]>();
  for (const row of filtered.slice(0, count)) {
    const month = creditMonth(row.created_at);
    const group = groups.get(month) ?? [];
    group.push(row);
    groups.set(month, group);
  }

  return <section className="space-y-3" aria-labelledby="credit-activity">
    <h2 id="credit-activity" className="font-heading text-xl font-bold">Activity</h2>
    <div role="group" aria-label="Filter activity" className="flex flex-wrap gap-2">
      {filters.map(value => <button key={value} type="button" aria-pressed={filter === value}
        className={chip(filter === value)} onClick={() => { setFilter(value); setCount(pageSize); }}>{value}</button>)}
    </div>
    {Array.from(groups, ([month, entries]) => <section key={month}>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#5B6F89]">{month}</h3>
      <ul className="divide-y divide-[#E3EEF9] rounded-2xl border border-[#E3EEF9] bg-white px-3">
        {entries.map(row => {
          const item = description(row);
          return <li key={row.id} className="flex items-start gap-2.5 py-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#EAF4FF] text-[#0A47B1]"><item.icon size={17} aria-hidden /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{item.title}</p>
              <p className="mt-0.5 break-words text-xs text-[#5B6F89]">{item.subtitle}</p>
            </div>
            <div className="max-w-[42%] shrink-0 text-right">
              <p className={`break-words text-sm font-bold tabular-nums ${item.color ?? ""}`}>{item.amount}</p>
              {item.chip && <span className={`mt-1 inline-block rounded-full px-2 py-1 text-xs font-semibold ${item.tone}`}>{item.chip}</span>}
            </div>
          </li>;
        })}
      </ul>
    </section>)}
    {!filtered.length && <div className="rounded-2xl border border-dashed border-[#D6E6F7] bg-white p-5 text-center" role="status">
      <Wallet size={24} aria-hidden className="mx-auto text-[#0A47B1]" />
      <p className="mt-2 font-semibold">{rows.length ? "No matching activity" : "No activity yet"}</p>
      <p className="mt-1 text-sm text-[#5B6F89]">{rows.length ? "Choose another filter to see more." : "Top-ups and platform fees will show here."}</p>
    </div>}
    {filtered.length > count && <button type="button" className={`${secondary} w-full`}
      onClick={() => setCount(count + pageSize)}>Show earlier months</button>}
  </section>;
}
