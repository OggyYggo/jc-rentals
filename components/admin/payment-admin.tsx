"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { runWithAlerts } from "@/lib/alerts/run";
import { normalizePaymentReference } from "@/lib/payment-format";
import { createClient } from "@/lib/supabase/client";
import { AdminFilterChips, adminManilaDate, adminMoney, mobileAction, mobilePrimaryAction, peso } from "@/components/admin/ui";

export type Topup = { id: string; owner_id: string; amount: number; status: string; reference_no: string | null; proof_path: string | null; created_at: string; owner: { business_name: string } | null };
type Transfer = { amount: string; reference: string };

export function useTopupProofs(rows: Topup[], history: Topup[], tab: string, viewport: "mobile" | "desktop") {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    const desktop = window.matchMedia("(min-width: 64rem)");
    function loadProofs() {
      if (desktop.matches !== (viewport === "desktop") || tab === "online") return;
      const db = createClient();
      const selected = tab === "pending" ? rows : history.filter(row => tab === "history" || row.status === tab);
      for (const row of selected) {
        if (!row.proof_path?.startsWith(`${row.owner_id}/`)) continue;
        void db.storage.from("topup-proofs").createSignedUrl(row.proof_path, 300).then(({ data }) => {
          if (active && data?.signedUrl) setUrls((current) => ({ ...current, [row.id]: data.signedUrl }));
        });
      }
    }
    loadProofs();
    desktop.addEventListener("change", loadProofs);
    return () => { active = false; desktop.removeEventListener("change", loadProofs); };
  }, [rows, history, tab, viewport]);
  return urls;
}

export function topupTransferMatches(row: Topup, transfer: Transfer, proof: string | undefined) {
  const expectedReference = normalizePaymentReference(row.reference_no ?? "");
  return Boolean(proof && transfer.amount && expectedReference && Number(transfer.amount) === Number(row.amount) &&
    normalizePaymentReference(transfer.reference) === expectedReference);
}

export function useReviewTopup() {
  const [busy, setBusy] = useState("");
  const router = useRouter();
  function review(row: Topup, approve: boolean, transfer?: Transfer, confirmed = false) {
    return runWithAlerts({
      confirm: approve && !confirmed ? {
        title: "Approve this top-up?",
        text: `Post ${peso(Number(row.amount))} in credits to ${row.owner?.business_name ?? "this owner"}.`,
        confirmText: "Post credits",
      } : undefined,
      reason: approve ? undefined : { title: "Reject this top-up?", label: "Reason for rejection", confirmText: "Reject top-up" },
      setPending: (pending) => setBusy(pending ? row.id : ""),
      run: async (reason) => {
        const { error } = await createClient().rpc("admin_review_owner_topup", {
          p_ledger_id: row.id, p_approve: approve, p_reason: approve ? null : reason,
          p_received_amount: approve ? Number(transfer?.amount) : null,
          p_received_reference: approve ? transfer?.reference : null,
        });
        if (error) throw error;
      },
      success: approve ? "Top-up approved" : "Top-up rejected",
      refresh: router.refresh,
    });
  }
  return { busy, review };
}

export function AdminTopupReview({ rows, history, historyAvailable }: { rows: Topup[]; history: Topup[]; historyAvailable: boolean }) {
  const [tab, setTab] = useState("pending");
  const urls = useTopupProofs(rows, history, tab, "desktop");
  const { busy, review } = useReviewTopup();
  const [transfers, setTransfers] = useState<Record<string, Transfer>>({});

  const visible = tab === "pending" ? rows : history.filter(row => row.status === tab);
  const options = [{ value: "pending", label: "To verify", count: rows.length }, ...[
    { value: "posted", label: "Verified" }, { value: "rejected", label: "Rejected" },
  ].map(option => ({ ...option, count: historyAvailable ? history.filter(row => row.status === option.value).length : undefined }))];

  return <div className="space-y-3">
    <div className="lg:hidden"><AdminFilterChips label="Top-up status" value={tab} options={options} onChange={setTab}/></div>
    {!rows.length && <p className={`rounded-xl border bg-white p-8 text-center text-sm text-slate-500 ${tab !== "pending" ? "max-lg:hidden" : ""}`}>No top-ups waiting for review.</p>}
    {tab !== "pending" && !visible.length && <p className="rounded-xl border bg-white p-4 text-sm lg:hidden">{historyAvailable ? "No top-ups match this filter." : "Could not load top-up history."}</p>}
    {[...rows, ...(tab === "pending" ? [] : visible)].map(row => {
      const transfer = transfers[row.id] ?? { amount: "", reference: "" };
      const matched = topupTransferMatches(row, transfer, urls[row.id]);
      const updateTransfer = (key: "amount" | "reference", value: string) => setTransfers(current =>
        ({ ...current, [row.id]: { ...(current[row.id] ?? transfer), [key]: value } }));
      return <article key={row.id} className={`flex flex-wrap gap-5 rounded-xl border bg-white p-5 ${row.status === "pending" ? tab === "pending" ? "" : "max-lg:hidden" : "lg:hidden"}`}>
      {urls[row.id] && <><Image src={urls[row.id]} alt="Top-up proof" width={192} height={192} unoptimized className="hidden h-auto w-auto max-h-48 max-w-48 rounded object-contain lg:block"/><a href={urls[row.id]} target="_blank" rel="noreferrer" className="min-h-11 lg:hidden"><Image src={urls[row.id]} alt="Top-up proof" width={96} height={80} unoptimized className="h-auto w-auto max-h-20 max-w-24 rounded object-contain"/></a></>}
      <div className="min-w-0">
        <h2 className="font-semibold">{row.owner?.business_name ?? row.owner_id}</h2>
        <p className="mt-1 text-sm"><span className="lg:hidden">{adminMoney(Number(row.amount))}</span><span className="hidden lg:inline">{peso(Number(row.amount))}</span> · Ref {row.reference_no || "—"}</p>
        <p className="text-xs text-slate-500"><span className="lg:hidden">{adminManilaDate(row.created_at)}</span><span className="hidden lg:inline">{new Date(row.created_at).toLocaleString("en-PH")}</span></p>
        {row.status === "pending" && <>
          <fieldset disabled={!!busy} className="mt-4 flex flex-wrap gap-2">
            <legend className="text-sm font-semibold">Match the transfer in your payment account</legend>
            <label className="text-sm">Amount received
              <input type="number" min="0.01" step="0.01" inputMode="decimal" value={transfer.amount}
                onChange={event => updateTransfer("amount", event.target.value)} className="block min-h-11 w-full rounded border p-2" />
            </label>
            <label className="text-sm">Transfer reference
              <input maxLength={100} value={transfer.reference}
                onChange={event => updateTransfer("reference", event.target.value)} className="block min-h-11 w-full rounded border p-2" />
            </label>
          </fieldset>
          <div className="mt-4 flex flex-wrap gap-2">
          <button disabled={!!busy || !matched} onClick={() => review(row, true, transfer)} className={mobilePrimaryAction + " lg:hidden!"}>{busy === row.id ? "Working…" : "Verify and add credits"}</button>
          <button disabled={!!busy || !matched} onClick={() => review(row, true, transfer)} className="hidden rounded bg-green-700 px-3 py-2 text-sm text-white disabled:opacity-50 lg:inline-block">{busy === row.id ? "Working…" : "Post credits"}</button>
          <button disabled={!!busy} onClick={() => review(row, false)} className={mobileAction + " text-red-700 lg:hidden!"}>Reject</button><button disabled={!!busy} onClick={() => review(row, false)} className="hidden rounded border px-3 py-2 text-sm text-red-700 disabled:opacity-50 lg:inline-block">Reject</button>
        </div></>}
      </div>
    </article>;
    })}
  </div>;
}
