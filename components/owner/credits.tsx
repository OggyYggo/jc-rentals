"use client";
import { runWithAlerts } from "@/lib/alerts/run";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
type Row = { id: string; type: string; amount: number; status: string; reference_no: string | null; proof_path: string | null; note: string | null; created_at: string };
export function OwnerCredits({ ownerId, rows, balance, minimum, accountName, qrUrl, onlineTopup }: { ownerId: string; rows: Row[]; balance: number; minimum: number; accountName: string; qrUrl: string | null; onlineTopup?: ReactNode }) {
 const router = useRouter(); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
 async function submit(event: React.FormEvent<HTMLFormElement>) {
   event.preventDefault();
   setError("");
   const form = event.currentTarget;
   const values = new FormData(form);
   const amount = Number(values.get("amount"));
   const reference = String(values.get("reference") ?? "").trim();
   const file = values.get("proof");
   if (!(amount > 0) || !reference || !(file instanceof File) || !file.size) {
     setError("Enter an amount, transfer reference, and proof image.");
     return;
   }
   const result = await runWithAlerts({
     setPending: setBusy,
     run: async () => {
       const db = createClient();
       const path = `${ownerId}/${crypto.randomUUID()}.${file.type === "image/png" ? "png" : "jpg"}`;
       const upload = await db.storage.from("topup-proofs").upload(path, file, { contentType: file.type });
       if (upload.error) throw upload.error;
       const request = await db.from("owner_credit_ledger").insert({
         owner_id: ownerId, type: "topup", amount, status: "pending", reference_no: reference,
         proof_path: path, note: "Owner credit top-up request",
       });
       if (request.error) {
         await db.storage.from("topup-proofs").remove([path]);
         throw request.error;
       }
     },
     success: "Top-up sent for review",
     refresh: router.refresh,
   });
   if (result.ok) form.reset();
 }
 return <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,.8fr)]"><section id="top-up" className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-500">Available credits</p><p className="mt-1 text-3xl font-bold">{new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(balance)}</p>{balance<minimum&&<p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Your listings are hidden until your available credits reach {new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(minimum)}.</p>}<h2 id="manual-top-up" className="mt-6 font-semibold">Top up credits</h2><p className="mt-1 text-sm text-slate-600">Pay to {accountName||"the platform account"}, then submit the transfer details. Credits appear after an administrator reviews your proof.</p>{qrUrl&&<img src={qrUrl} alt="Platform top-up QR" className="my-4 max-h-56 rounded-lg border p-2"/>}<form onSubmit={submit} className="mt-4 space-y-3"><input name="amount" aria-describedby={error ? "topup-validation-error" : undefined} type="number" min="1" step="0.01" required placeholder="Amount" className="w-full rounded-lg border p-2"/><input name="reference" aria-describedby={error ? "topup-validation-error" : undefined} required placeholder="Transfer reference" className="w-full rounded-lg border p-2"/><input name="proof" aria-describedby={error ? "topup-validation-error" : undefined} type="file" accept="image/*" required className="w-full rounded-lg border p-2"/>{error&&<p id="topup-validation-error" role="alert" className="text-sm text-red-700">{error}</p>}<button disabled={busy} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white">{busy?"Submitting…":"Submit top-up proof"}</button></form>{onlineTopup}</section><section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Credit activity</h2><div className="mt-4 divide-y">{rows.map(r=><div key={r.id} className="flex justify-between gap-3 py-3 text-sm"><div><p className="font-medium capitalize">{r.type.replaceAll("_"," ")}</p><p className="text-xs text-slate-500">{r.reference_no||r.note||new Date(r.created_at).toLocaleDateString("en-PH")}</p></div><div className="text-right"><p>{new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(r.amount))}</p><p className="text-xs capitalize text-slate-500">{r.status}</p></div></div>)}{!rows.length&&<p className="py-5 text-sm text-slate-500">No credit activity yet.</p>}</div></section></div>;
}
