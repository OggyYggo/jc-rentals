"use client";

import { showConnectionDialog } from "@/lib/alerts/connection";
import { slowConnectionToast } from "@/lib/alerts/toast";
import { useConnectionStatus } from "@/lib/connection/provider";
import { connectionError, isOffline, withConnectionDeadline } from "@/lib/connection/request";
import { UploadPaused } from "@/components/loading/UploadPaused";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SubmitButton } from "@/components/loading/SubmitButton";
import { normalizePaymentReference, paymentPeso } from "@/lib/payment-format";
import { friendlyPaymentError, paymentReferenceError } from "@/lib/alerts/errors";
import { Check, LoaderCircle, TriangleAlert } from "lucide-react";
import { logPaymentImageFailure } from "@/lib/payment-image-log";
import { PaymentImageError, paymentImage } from "@/lib/payment-image";

export function PaymentProofForm({ bookingId, customerId, amount, paymentOptionId, onProofChosen }: { bookingId: string; customerId: string; amount: number; paymentOptionId?: string; onProofChosen?: (chosen: boolean) => void }) {
  const router = useRouter();
  const offline = useConnectionStatus() === "offline";
  const [selected, setSelected] = useState<File>();
  const [image, setImage] = useState<Blob>();
  const [imageError, setImageError] = useState("");
  const preview = useRef<HTMLImageElement>(null);
  const [processing, setProcessing] = useState(false);
  const [reference, setReference] = useState("");
  const [touched, setTouched] = useState(false);
  const [referenceRejection, setReferenceRejection] = useState<{ value: string; message: string }>();
  const selection = useRef(0);
  const normalizedReference = normalizePaymentReference(reference);
  const localReferenceValid = /^[A-Z0-9]{6,40}$/.test(normalizedReference);
  const serverReferenceError = referenceRejection?.value === normalizedReference ? referenceRejection.message : "";
  const validReference = localReferenceValid && !serverReferenceError;
  const invalidReference = (touched || Boolean(reference)) && !validReference;

  useEffect(() => {
    if (!image) return;
    const url = URL.createObjectURL(image);
    if (preview.current) preview.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [image]);

  async function choose(file?: File) {
    const current = ++selection.current;
    setSelected(file);
    if (file && isOffline()) setPaused(true);
    onProofChosen?.(Boolean(file));
    setImage(undefined);
    setImageError("");
    setError("");
    setProcessing(Boolean(file));
    if (!file) return;
    try {
      const result = await paymentImage(file);
      if (selection.current === current) setImage(result);
    } catch (error) {
      const issue = error instanceof PaymentImageError ? error : new PaymentImageError("IMAGE_UNREADABLE");
      if (selection.current === current) setImageError(friendlyPaymentError(issue));
      void logPaymentImageFailure(issue.code, file.type, file.size).catch(() => {});
    } finally {
      if (selection.current === current) setProcessing(false);
    }
  }
  const [paused, setPaused] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [refreshing, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState("");

  async function submit() {
    if (inFlight.current || uncertain || !validReference || !image) return;
    if (isOffline()) { setPaused(true); return; }
    setPaused(false);
    inFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    let attempted = false;
    let uploading = false;
    const submittedReference = reference.trim();
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
      const path = `${customerId}/${bookingId}/${crypto.randomUUID()}.${image.type === "image/jpeg" ? "jpg" : "webp"}`;
      uploading = true;
      const { error: uploadError } = await withConnectionDeadline(() => db.storage.from("payment-proofs").upload(path, image, { contentType: image.type }));
      if (uploadError) throw uploadError;
      uploading = false;
      attempted = true;
      const { data: id, error: submitError } = await withConnectionDeadline(signal => db.rpc("submit_booking_payment", {
        p_booking_id: bookingId, p_reference: submittedReference, p_proof_path: path,
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
          reference: submittedReference, amount, time,
          checkStatus: async () => {
            const { data, error } = await withConnectionDeadline(signal => createClient().from("payments").select("status")
              .eq("booking_id", bookingId).eq("reference_norm", normalizePaymentReference(submittedReference))
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
      const rejectedReference = paymentReferenceError(cause);
      if (rejectedReference) setReferenceRejection({ value: normalizedReference, message: rejectedReference });
      else if (attempted && message.startsWith("We couldn’t check your payment status")) setNotice(message);
      else setError(message);
    } finally {
      clearTimeout(slow);
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (submitted) return <p role="status" className="rounded-2xl bg-[#E3F7EA] p-4 text-[#12703A]">{submitted}</p>;

  const reason = busy || refreshing ? "Sending your proof…" : uncertain ? "Check your booking before sending more proof."
    : offline ? "Connect to the internet to send proof." : paused ? "Retry the paused upload to continue."
    : !validReference ? "Fix the reference to continue." : processing ? "Preparing your screenshot…"
    : !image ? "Choose a screenshot to continue." : "";
  const action = "inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-[#0A3D91] underline";
  return <form onSubmit={event => { event.preventDefault(); if (!reason) void submit(); }}
    aria-busy={busy} className="space-y-4 rounded-2xl border border-[#D6E6F7] bg-white p-4 sm:p-5">
    <div>
      <h2 className="font-heading text-xl font-bold">Send your proof</h2>
      <p className="text-sm text-[#5B6F89]">Two things so the owner can confirm.</p>
      <p className="mt-3 rounded-lg bg-[#EAF4FF] p-3 text-sm">You are sending proof for <strong>{paymentPeso(amount)}</strong></p>
    </div>
    <div>
      <label htmlFor="payment-reference" className="text-sm font-semibold">Transaction reference</label>
      <input id="payment-reference" required maxLength={100} autoComplete="off" autoCapitalize="characters" inputMode="text"
        value={reference} onChange={event => setReference(event.target.value)} onBlur={() => setTouched(true)}
        aria-invalid={invalidReference} aria-describedby="payment-reference-feedback payment-reference-help"
        className="mt-1 block min-h-11 w-full rounded-lg border border-[#D6E6F7] p-3 text-base aria-invalid:border-[#A12A2A]" />
      <div id="payment-reference-feedback" className="mt-1 text-sm">
        {invalidReference && <p role="alert" className="flex items-start gap-1 text-[#A12A2A]"><TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />{serverReferenceError || `${normalizedReference.length < 6 ? "Too short." : "Too long."} ${paymentReferenceError(new Error("REFERENCE_INVALID"))}`}</p>}
        {validReference && <p role="status" className="flex items-center gap-1 text-[#12703A]"><Check size={16} aria-hidden />Looks good. Spaces are ignored.</p>}
      </div>
      <details id="payment-reference-help">
        <summary className="min-h-11 cursor-pointer py-3 text-sm text-[#0A3D91] underline">Where do I find it?</summary>
        <figure className="rounded-lg bg-[#F3F9FF] p-3 text-sm">
          <div aria-hidden="true">Transaction reference <b className="rounded bg-[#EAF4FF] p-1">ABC123456</b></div>
          <figcaption className="mt-2">Find the reference in your transfer history.</figcaption>
        </figure>
      </details>
    </div>
    <div role="group" aria-labelledby="payment-screenshot-label">
      <p id="payment-screenshot-label" className="text-sm font-semibold">Screenshot of your payment</p>
      <input ref={fileRef} aria-label="Screenshot of your payment" aria-invalid={Boolean(imageError)}
        aria-describedby={imageError ? "payment-image-error" : "payment-image-status"}
        type="file" accept="image/*,.heic,.heif" tabIndex={-1} className="sr-only"
        onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void choose(file); }} />
      <div className="mt-1 flex flex-wrap items-center gap-2 rounded-xl border border-[#D6E6F7] p-3">
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img ref={preview} alt="Screenshot preview" className="size-14 rounded object-contain" />
        )}
        <div id="payment-image-status" role="status" className="min-w-0 flex-1 break-words text-sm">
          {selected ? <><p>{selected.name}</p><p>{Math.max(1, Math.round((image?.size ?? selected.size) / 1024))} KB</p></> : <p>From your gallery or files</p>}
          {processing && <p className="flex items-center gap-1"><LoaderCircle size={16} className="motion-safe:animate-spin" aria-hidden />Preparing screenshot…</p>}
          {image && <p className="text-[#12703A]">Ready</p>}
        </div>
        <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className={action}>{selected ? "Change" : "Choose screenshot"}</button>
      </div>
      {imageError && <div className="mt-2 rounded-xl bg-[#FDE8E8] p-3 text-sm text-[#A12A2A]">
        <div id="payment-image-error" role="alert"><p className="font-semibold">{imageError}</p>
          <p>Try again, or take a new screenshot.</p></div>
        <button type="button" onClick={() => fileRef.current?.click()} className={action}>Choose another</button>
        <button type="button" onClick={() => void choose(selected)} className={action}>Try again</button>
      </div>}
    </div>
    <ul aria-label="Ready to send" className="flex flex-wrap gap-3 text-sm">
      <li className={validReference ? "text-[#12703A]" : "text-[#5B6F89]"}>{validReference ? "✓" : "○"} Reference<span className="sr-only">{validReference ? " ready" : " needed"}</span></li>
      <li className={image ? "text-[#12703A]" : "text-[#5B6F89]"}>{image ? "✓" : "○"} Screenshot<span className="sr-only">{image ? " ready" : " needed"}</span></li>
    </ul>
    {notice && <p role="status" className="text-sm text-slate-700">{notice}</p>}
    {error && <p role="alert" className="text-sm text-[#A12A2A]">{error}</p>}
    {selected && !uncertain && (offline || paused) && <UploadPaused fileName={selected.name} busy={busy}
      onRetry={() => { if (validReference && image) void submit(); else setTouched(true); }}
      onCancel={() => { setPaused(false); void choose(); }} />}
    {uncertain && <a href="/account/bookings" className={action}>Check your bookings</a>}
    <div className="sticky bottom-0 z-10 border-t border-[#E3EEF9] bg-white pt-2 pb-[max(.5rem,env(safe-area-inset-bottom))] md:static md:border-0 md:p-0">
      <SubmitButton disabled={Boolean(reason)} aria-describedby="payment-submit-reason" unstyled busy={busy || refreshing} pendingText="Sending…"
        className="flex min-h-[52px] w-full items-center justify-center rounded-full bg-[#0A47B1] px-4 text-sm font-semibold text-white disabled:opacity-50">Send proof</SubmitButton>
      <p id="payment-submit-reason" role="status" className="mt-1 text-center text-sm text-[#5B6F89]">{reason}</p>
    </div>
  </form>;
}
