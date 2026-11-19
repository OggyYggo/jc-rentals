"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { runWithAlerts } from "@/lib/alerts/run";
import { createClient } from "@/lib/supabase/client";
import { peso } from "@/components/admin/ui";

type Invoice = { id: string; owner_id: string; period_month: string; commission_due: number; status: string; due_date: string | null };

export function AdminInvoices({ rows }: { rows: Invoice[] }) {
  const router = useRouter();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [busy, setBusy] = useState("");

  function generate() {
    if (!month) return;
    const name = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01`));
    return runWithAlerts({
      confirm: { title: `Generate invoices for ${name}?`, confirmText: "Generate invoices" },
      setPending: (pending) => setBusy(pending ? "generate" : ""),
      run: async () => {
        const { data, error } = await createClient().rpc("admin_generate_monthly_invoices", { p_period_month: `${month}-01` });
        if (error) throw error;
        return Number(data);
      },
      success: (count) => `${count} invoice${count === 1 ? "" : "s"} created`,
      refresh: router.refresh,
    });
  }

  function paid(invoice: Invoice) {
    return runWithAlerts({
      confirm: {
        title: "Mark this invoice paid?",
        text: `Confirm that you received ${peso(Number(invoice.commission_due))} for the ${invoice.period_month.slice(0, 7)} invoice.`,
        confirmText: "Mark paid",
      },
      setPending: (pending) => setBusy(pending ? invoice.id : ""),
      run: async () => {
        const { error } = await createClient().rpc("admin_mark_invoice_paid", { p_invoice_id: invoice.id });
        if (error) throw error;
      },
      success: "Invoice marked paid",
      refresh: router.refresh,
    });
  }

  return <>
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <input aria-label="Invoice month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="rounded-lg border bg-white p-2 text-sm" />
      <button disabled={!!busy || !month} onClick={generate} className="rounded-lg bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50">{busy === "generate" ? "Generating…" : "Generate invoices"}</button>
    </div>
    <div className="space-y-2">
      {rows.map((invoice) => <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-3 text-sm">
        <span>{invoice.period_month} · {invoice.status} · due {invoice.due_date ?? "—"} · {peso(Number(invoice.commission_due))}</span>
        {invoice.status === "unpaid" && <button disabled={!!busy} onClick={() => paid(invoice)} className="rounded border px-3 py-1.5 text-xs disabled:opacity-50">{busy === invoice.id ? "Saving…" : "Mark paid"}</button>}
      </div>)}
      {!rows.length && <p className="text-sm text-slate-500">No invoices yet.</p>}
    </div>
  </>;
}
