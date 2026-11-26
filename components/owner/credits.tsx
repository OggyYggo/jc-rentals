"use client";
import { toastSuccess } from "@/lib/alerts/toast";
import type { ReactNode } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const proofExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const maxProofBytes = 10 * 1024 * 1024;

type Row = { id: string; type: string; amount: number; status: string; reference_no: string | null; proof_path: string | null; note: string | null; created_at: string };
export function OwnerCredits({ ownerId, rows, balance, minimum, accountName, qrUrl, onlineTopup }: { ownerId: string; rows: Row[]; balance: number; minimum: number; accountName: string; qrUrl: string | null; onlineTopup?: ReactNode }) {
 const router = useRouter(); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
 async function submit(event: React.FormEvent<HTMLFormElement>) {
   event.preventDefault();
   if (busy) return;
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
   const extension = proofExtensions[file.type];
   if (!extension || file.size > maxProofBytes) {
     setError("Choose a JPEG, PNG, or WebP screenshot up to 10 MB.");
     return;
   }
   setBusy(true);
   try {
     const db = createClient();
     const path = `${ownerId}/${crypto.randomUUID()}.${extension}`;
     const proofs = db.storage.from("topup-proofs");
     const upload = await proofs.upload(path, file, { contentType: file.type });
     if (upload.error) {
       setError("Could not upload your proof. Check your connection or choose another screenshot.");
       return;
     }
     const request = await db.from("owner_credit_ledger").insert({
       owner_id: ownerId, type: "topup", amount, status: "pending", reference_no: reference,
       proof_path: path, note: "Owner credit top-up request",
     });
     if (request.error) {
       // Keep the proof if the server may have saved the entry before the connection dropped.
       if (request.status >= 400 && request.status < 500) void proofs.remove([path]).catch(() => {});
       setError(request.error.code === "23505"
         ? "This transfer reference has already been submitted. Check Credit activity before trying again."
         : "Could not confirm your submission. Check Credit activity before trying again.");
       router.refresh();
       return;
     }
     form.reset();
     router.refresh();
     void toastSuccess("Top-up sent for review");
   } catch {
     setError("Could not confirm your submission. Check Credit activity before trying again.");
     router.refresh();
   } finally {
     setBusy(false);
   }
 }
 return <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,.8fr)]"><section id="top-up" className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-500">Available credits</p><p className="mt-1 text-3xl font-bold">{new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(balance)}</p>{balance<minimum&&<p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Your listings are hidden until your available credits reach {new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(minimum)}.</p>}{onlineTopup}<h2 id="manual-top-up" className="mt-6 font-semibold">Top up credits</h2><p className="mt-1 text-sm text-slate-600">Pay to {accountName||"the platform account"}, then submit the transfer details. Credits appear after an administrator reviews your proof.</p>{qrUrl&&<img src={qrUrl} alt="Platform top-up QR" className="my-4 max-h-56 rounded-lg border p-2"/>}<form onSubmit={submit} className="mt-4 space-y-3"><input name="amount" aria-describedby={error ? "topup-validation-error" : undefined} type="number" min="1" step="0.01" required placeholder="Amount" className="w-full rounded-lg border p-2"/><input name="reference" aria-describedby={error ? "topup-validation-error" : undefined} required placeholder="Transfer reference" className="w-full rounded-lg border p-2"/><input name="proof" aria-label="Transfer proof screenshot" aria-describedby={error ? "topup-proof-hint topup-validation-error" : "topup-proof-hint"} type="file" accept="image/jpeg,image/png,image/webp" required className="w-full rounded-lg border p-2"/><p id="topup-proof-hint" className="text-xs text-slate-600">JPEG, PNG, or WebP up to 10 MB.</p>{error&&<p id="topup-validation-error" role="alert" className="text-sm text-red-700">{error}</p>}<button disabled={busy} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white">{busy?"Submitting…":"Submit top-up proof"}</button></form></section><section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Credit activity</h2><div className="mt-4 divide-y">{rows.map(r=><div key={r.id} className="flex justify-between gap-3 py-3 text-sm"><div><p className="font-medium capitalize">{r.type.replaceAll("_"," ")}</p><p className="text-xs text-slate-500">{r.reference_no||r.note||new Date(r.created_at).toLocaleDateString("en-PH")}</p>{r.type === "topup" && r.status === "posted" && !r.proof_path && r.note === "Online top-up (BayadGate)" && <><p className="text-xs text-slate-500">{r.note}</p><span className="mt-1 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800">Paid online</span></>}</div><div className="text-right"><p>{new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(r.amount))}</p><p className="text-xs capitalize text-slate-500">{r.status}</p></div></div>)}{!rows.length&&<p className="py-5 text-sm text-slate-500">No credit activity yet.</p>}</div></section></div>;
}
