"use client";

import { showConnectionDialog } from "@/lib/alerts/connection";
import { slowConnectionToast } from "@/lib/alerts/toast";
import { useConnectionStatus } from "@/lib/connection/provider";
import { connectionError, isOffline, withConnectionDeadline } from "@/lib/connection/request";
import { UploadPaused } from "@/components/loading/UploadPaused";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SubmitButton } from "@/components/loading/SubmitButton";
import { normalizePaymentReference, paymentPeso } from "@/lib/payment-format";
import { friendlyPaymentError } from "@/lib/alerts/errors";
import { paymentImage } from "@/lib/payment-image";

export function PaymentProofForm({ bookingId, customerId, amount, paymentOptionId }: { bookingId: string; customerId: string; amount: number; paymentOptionId?: string }) {
  const router = useRouter();
  const offline = useConnectionStatus() === "offline";
  const [selected, setSelected] = useState("");
  const [paused, setPaused] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [refreshing, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState("");

  async function submit(form: FormData) {
    if (inFlight.current || uncertain) return;
    if (isOffline()) { setPaused(true); return; }
    setPaused(false);
    inFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    let attempted = false;
    let uploading = false;
    const reference = String(form.get("reference") ?? "").trim();
    const time = new Date();
    const slow = setTimeout(() => void slowConnectionToast(), 8000);
    try {
      const db = createClient();
      const { data: current, error: readError } = await withConnectionDeadline(signal => db.from("bookings").select("status")
        .eq("id", bookingId).eq("customer_id", customerId).abortSignal(signal).maybeSingle(), 15_000);
      if (readError) throw readError;
      if (current && ["confirmed", "picked_up", "returned", "completed"].includes(current.status)) {
        setSubmitted("Payment already confirmed");
        startTransition(() => router.refresh());
        return;
      }
      if (!/^[A-Z0-9]{6,40}$/.test(normalizePaymentReference(reference))) throw new Error("REFERENCE_INVALID");
      const image = await paymentImage(form.get("proof") as File);
      const path = `${customerId}/${bookingId}/${crypto.randomUUID()}.webp`;
      uploading = true;
      const { error: uploadError } = await withConnectionDeadline(() => db.storage.from("payment-proofs").upload(path, image, { contentType: image.type }));
      if (uploadError) throw uploadError;
      uploading = false;
      attempted = true;
      const { data: id, error: submitError } = await withConnectionDeadline(signal => db.rpc("submit_booking_payment", {
        p_booking_id: bookingId, p_reference: reference, p_proof_path: path,
        ...(paymentOptionId ? { p_payment_option_id: paymentOptionId } : {}),
      }).abortSignal(signal));
      if (submitError) throw submitError;
      const { data: payment } = await withConnectionDeadline(signal =>
        db.from("payments").select("status").eq("id", id).abortSignal(signal).maybeSingle(), 15_000).catch(() => ({ data: null }));
      setSubmitted(payment?.status === "verified" ? "Payment already confirmed" : "Proof sent. The owner is checking your payment.");
      startTransition(() => router.refresh());
      if (payment?.status !== "verified") void fetch(`/api/payments/${id}/fingerprint`, { method: "POST" }).catch(() => {});
    } catch (cause) {
      const issue = connectionError(cause);
      if (issue && uploading) { setPaused(true); return; }
      if (issue && attempted && issue.sent) {
        setUncertain(true);
        const result = await showConnectionDialog<string>({
          reference, amount, time,
          checkStatus: async () => {
            const { data, error } = await withConnectionDeadline(signal => createClient().from("payments").select("status")
              .eq("booking_id", bookingId).eq("reference_norm", normalizePaymentReference(reference))
              .abortSignal(signal).limit(1).maybeSingle(), 15_000);
            if (error || !data) return { state: "unknown" };
            return { state: "found", data: data.status === "verified" ? "Payment already confirmed"
              : data.status === "pending" ? "Proof sent. The owner is checking your payment." : "Your proof was received. Check your booking for its status." };
          },
        }, false);
        if (result.recovered) {
          setSubmitted(result.data);
          startTransition(() => router.refresh());
        } else setNotice("Check your booking for the transfer status before sending more proof.");
        return;
      }
      if (issue && (!attempted || !issue.sent)) { setPaused(true); return; }
      const message = friendlyPaymentError(cause);
      if (attempted) {
        try {
          const { data: current } = await withConnectionDeadline(signal => createClient().from("bookings").select("status")
            .eq("id", bookingId).eq("customer_id", customerId).abortSignal(signal).maybeSingle(), 15_000);
          if (current && current.status !== "awaiting_payment") {
            if (["confirmed", "picked_up", "returned", "completed"].includes(current.status)) setSubmitted("Payment already confirmed");
            else if (current.status === "payment_review") setSubmitted("Proof sent. The owner is checking your payment.");
            else setNotice("The booking status changed. Checking payment details…");
            startTransition(() => router.refresh());
            return;
          }
        } catch {
          // The page polls again when the connection returns.
        }
      }
      console.error("Payment proof submission failed", cause);
      if (attempted && message.startsWith("We couldn’t check your payment status")) setNotice(message);
      else setError(message);
    } finally {
      clearTimeout(slow);
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (submitted) return <p role="status" className="mt-5 rounded-lg bg-amber-50 p-4">{submitted}</p>;
  return <form ref={formRef} onSubmit={(event) => {
    event.preventDefault();
    if (!busy && !refreshing) void submit(new FormData(event.currentTarget));
  }} aria-busy={busy} className="mt-6 space-y-4 border-t pt-5">
    <h2 className="font-semibold max-md:font-heading"><span className="md:hidden">Send proof</span><span className="hidden md:inline">Submit transfer proof</span></h2>
    <label className="hidden text-sm md:block">Amount sent<input readOnly value={paymentPeso(amount)} className="mt-1 block w-full rounded-lg border bg-slate-50 p-3" /></label>
    <label className="block text-sm">Wallet or bank transaction reference
      <input name="reference" required maxLength={100} aria-describedby="reference-help" className="mt-1 block w-full rounded-lg border p-3" />
    </label>
    <figure id="reference-help" className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
      <div aria-hidden="true" className="inline-block rounded border bg-white p-2">Transaction reference <b className="rounded bg-blue-100 p-1">ABC123456</b></div>
      <figcaption className="mt-2">Find the reference in your transfer history. Use 6–40 letters or digits. Spaces and punctuation are ignored.</figcaption>
    </figure>
    <label className="block text-sm">Transfer screenshot (up to 5 MB)
      <input ref={fileRef} onChange={event => { setSelected(event.currentTarget.files?.[0]?.name ?? ""); setPaused(isOffline()); }} name="proof" type="file" accept="image/jpeg,image/png,image/webp" required className="mt-1 block w-full min-w-0 rounded-lg border p-3" />
    </label>
    {notice && <p role="status" className="text-sm text-slate-700">{notice}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {selected && !uncertain && (offline || paused) && <UploadPaused fileName={selected} busy={busy} onRetry={() => {
      if (formRef.current?.reportValidity()) void submit(new FormData(formRef.current));
    }} onCancel={() => { setPaused(false); setSelected(""); if (fileRef.current) fileRef.current.value = ""; }} />}
    {uncertain && <a href="/account/bookings" className="inline-flex min-h-11 items-center text-[#0A47B1] underline">Check your bookings</a>}
    <SubmitButton disabled={uncertain || Boolean(paused)} unstyled busy={busy || refreshing} pendingText="Submitting…" className="inline-flex min-h-11 items-center rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-50 max-md:h-[52px] max-md:w-full max-md:justify-center max-md:rounded-full max-md:bg-[#0A47B1]">
      <span className="md:hidden">Send proof</span><span className="hidden md:inline">Submit payment proof</span>
    </SubmitButton>
  </form>;
}
