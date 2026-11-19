"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { runWithAlerts } from "@/lib/alerts/run";
import { createClient } from "@/lib/supabase/client";
import { peso } from "@/components/admin/ui";

type Topup = { id: string; owner_id: string; amount: number; reference_no: string | null; proof_path: string | null; created_at: string; owner: { business_name: string } | null };

export function AdminTopupReview({ rows }: { rows: Topup[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const router = useRouter();
  useEffect(() => {
    let active = true;
    const db = createClient();
    for (const row of rows) {
      if (!row.proof_path) continue;
      void db.storage.from("topup-proofs").createSignedUrl(row.proof_path, 300).then(({ data }) => {
        if (active && data?.signedUrl) setUrls((current) => ({ ...current, [row.id]: data.signedUrl }));
      });
    }
    return () => { active = false; };
  }, [rows]);

  function review(row: Topup, approve: boolean) {
    return runWithAlerts({
      confirm: approve ? {
        title: "Approve this top-up?",
        text: `Post ${peso(Number(row.amount))} in credits to ${row.owner?.business_name ?? "this owner"}.`,
        confirmText: "Post credits",
      } : undefined,
      reason: approve ? undefined : { title: "Reject this top-up?", label: "Reason for rejection", confirmText: "Reject top-up" },
      setPending: (pending) => setBusy(pending ? row.id : ""),
      run: async (reason) => {
        const { error } = await createClient().rpc("admin_review_owner_topup", {
          p_ledger_id: row.id, p_approve: approve, p_reason: approve ? null : reason,
        });
        if (error) throw error;
      },
      success: approve ? "Top-up approved" : "Top-up rejected",
      refresh: router.refresh,
    });
  }

  return <div className="space-y-3">
    {!rows.length && <p className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">No top-ups waiting for review.</p>}
    {rows.map((row) => <article key={row.id} className="flex flex-wrap gap-5 rounded-xl border bg-white p-5">
      {urls[row.id] && <img src={urls[row.id]} alt="Top-up proof" className="max-h-48 max-w-48 rounded object-contain" />}
      <div>
        <h2 className="font-semibold">{row.owner?.business_name ?? row.owner_id}</h2>
        <p className="mt-1 text-sm">{peso(Number(row.amount))} · Ref {row.reference_no || "—"}</p>
        <p className="text-xs text-slate-500">{new Date(row.created_at).toLocaleString("en-PH")}</p>
        <div className="mt-4 flex gap-2">
          <button disabled={!!busy} onClick={() => review(row, true)} className="rounded bg-green-700 px-3 py-2 text-sm text-white disabled:opacity-50">{busy === row.id ? "Working…" : "Post credits"}</button>
          <button disabled={!!busy} onClick={() => review(row, false)} className="rounded border px-3 py-2 text-sm text-red-700 disabled:opacity-50">Reject</button>
        </div>
      </div>
    </article>)}
  </div>;
}
