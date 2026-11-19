"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { peso } from "@/lib/plans/breakEven";

export type PlanPaymentRow = { id:string; owner_id:string; plan_id:string; amount:number; reference_no:string; proof_path:string|null; proof_url:string|null; status:string; months:number; reject_reason:string|null; created_at:string; owner_name:string; plan_name:string };

export function PlanPaymentReview({ rows }: { rows:PlanPaymentRow[] }) {
  const router=useRouter();
  const [tab,setTab]=useState("pending");
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const visible=useMemo(()=>rows.filter((row)=>row.status===tab),[rows,tab]);
  async function review(row:PlanPaymentRow,approve:boolean) {
    if(approve&&!window.confirm(`Approve ${row.plan_name} for ${row.owner_name}? This activates the plan.`))return;
    const reason=approve?null:window.prompt("Reason for rejecting this payment:")?.trim();
    if(!approve&&!reason)return;
    setBusy(row.id);setError("");
    const {error:rpcError}=await createClient().rpc("admin_review_plan_payment",{p_payment:row.id,p_approve:approve,p_reason:reason});
    if(rpcError)setError("Could not review this payment. Refresh and try again.");else router.refresh();
    setBusy("");
  }
  return <div className="space-y-4"><div className="flex flex-wrap gap-2">{["pending","verified","rejected"].map((status)=><button key={status} onClick={()=>setTab(status)} className={`rounded-lg px-4 py-2 text-sm font-semibold capitalize ${tab===status?"bg-[#2457d6] text-white":"border bg-white text-[#526178]"}`}>{status} <span className="ml-1 opacity-75">{rows.filter((row)=>row.status===status).length}</span></button>)}</div>
    {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {!visible.length&&<p className="rounded-xl border border-[#e7ecf3] bg-white p-8 text-center text-sm text-[#718096]">No {tab} plan payments.</p>}
    {visible.map((row)=><article key={row.id} className="flex flex-wrap gap-5 rounded-xl border border-[#e7ecf3] bg-white p-5">{row.proof_url&&<a href={row.proof_url} target="_blank" rel="noopener"><img src={row.proof_url} alt="Plan payment proof" className="max-h-48 max-w-48 rounded object-contain"/></a>}<div className="min-w-[240px] flex-1"><h2 className="font-semibold text-[#33455e]">{row.owner_name} · {row.plan_name}</h2><p className="mt-1 text-sm text-[#526178]">{peso(Number(row.amount))} · {row.months} month{row.months===1?"":"s"}</p><p className="mt-1 text-sm text-[#526178]">Reference: {row.reference_no}</p><p className="mt-1 text-xs text-[#8491a3]">{new Date(row.created_at).toLocaleString("en-PH")}</p>{row.reject_reason&&<p className="mt-2 text-sm text-red-700">Reason: {row.reject_reason}</p>}{row.status==="pending"&&<div className="mt-4 flex gap-2"><button disabled={busy===row.id} onClick={()=>review(row,true)} className="rounded-lg bg-green-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">Approve and activate</button><button disabled={busy===row.id} onClick={()=>review(row,false)} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-60">Reject</button></div>}</div></article>)}
  </div>;
}
