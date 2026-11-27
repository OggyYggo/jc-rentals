"use client";
import { useConnectionStatus } from "@/lib/connection/provider";
import { ErrorState } from "@/components/loading/ErrorState";
import { UploadPaused } from "@/components/loading/UploadPaused";
import { submitCreditProof } from "./submit-credit-proof";
import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
export type CreditRow = { id: string; type: string; amount: number; status: string; reference_no: string | null; proof_path: string | null; note: string | null; created_at: string };
export function OwnerCredits({ ownerId, rows, balance, minimum, accountName, qrUrl, onlineTopup, activityUnavailable }: { ownerId: string; rows: CreditRow[]; balance: number; minimum: number; accountName: string; qrUrl: string | null; onlineTopup?: ReactNode; activityUnavailable?: boolean }) {
 const offline = useConnectionStatus() === "offline";
 const [paused, setPaused] = useState(false);
 const [uncertain, setUncertain] = useState(false);
 const [fileName, setFileName] = useState("");
 const formRef = useRef<HTMLFormElement>(null);
 const fileRef = useRef<HTMLInputElement>(null);
 const router = useRouter(); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
 async function submit(event: React.FormEvent<HTMLFormElement>) {
   event.preventDefault();
   if (busy || offline || uncertain) return;
   setPaused(false);
   setError("");
   const form = event.currentTarget;
   const result = await submitCreditProof(form, ownerId, setError, setBusy, router.refresh, () => setPaused(true), () => setUncertain(true));
   if (result.ok) { form.reset(); setFileName(""); setUncertain(false); }
 }
 return <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,.8fr)]"><section id="top-up" className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-500">Available credits</p><p className="mt-1 text-3xl font-bold">{new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(balance)}</p>{balance<minimum&&<p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Your listings are hidden until your available credits reach {new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(minimum)}.</p>}<h2 id="manual-top-up" className="mt-6 font-semibold">Top up credits</h2><p className="mt-1 text-sm text-slate-600">Pay to {accountName||"the platform account"}, then submit the transfer details. Credits appear after an administrator reviews your proof.</p>{qrUrl&&<img src={qrUrl} alt="Platform top-up QR" className="my-4 max-h-56 rounded-lg border p-2"/>}<form ref={formRef} onSubmit={submit} className="mt-4 space-y-3"><input name="amount" aria-describedby={error ? "topup-validation-error" : undefined} type="number" min="1" step="0.01" required placeholder="Amount" className="w-full rounded-lg border p-2"/><input name="reference" aria-describedby={error ? "topup-validation-error" : undefined} required placeholder="Transfer reference" className="w-full rounded-lg border p-2"/><input ref={fileRef} onChange={event => { setPaused(false); setFileName(event.currentTarget.files?.[0]?.name ?? ""); }} name="proof" aria-describedby={error ? "topup-validation-error" : undefined} type="file" accept="image/*" required className="w-full rounded-lg border p-2"/>{error&&<p id="topup-validation-error" role="alert" className="text-sm text-red-700">{error}</p>}{fileName && (offline || paused) && !uncertain && <UploadPaused fileName={fileName} busy={busy}
   onRetry={() => formRef.current?.requestSubmit()} onCancel={() => { setPaused(false); setFileName(""); if (fileRef.current) fileRef.current.value = ""; }} />}
   {uncertain && <a href="/owner/credits" className="inline-flex min-h-11 items-center underline">Check credits</a>}
   <button disabled={busy || offline || paused || uncertain} className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white">{busy?"Submitting…":offline?"Needs internet to continue":"Submit top-up proof"}</button></form>{onlineTopup}</section><section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Credit activity</h2>{activityUnavailable ? <ErrorState variant="connection" message="Couldn't load credit activity" /> : <div className="mt-4 divide-y">{rows.map(r=><div key={r.id} className="flex justify-between gap-3 py-3 text-sm"><div><p className="font-medium capitalize">{r.type.replaceAll("_"," ")}</p><p className="text-xs text-slate-500">{r.reference_no||r.note||new Date(r.created_at).toLocaleDateString("en-PH")}</p></div><div className="text-right"><p>{new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(r.amount))}</p><p className="text-xs capitalize text-slate-500">{r.status}</p></div></div>)}{!rows.length&&<p className="py-5 text-sm text-slate-500">No credit activity yet.</p>}</div>}</section></div>;
}
