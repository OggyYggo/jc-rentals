"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/loading/Spinner";
import { normalizePaymentReference, paymentPeso } from "@/lib/payment-format";
import { friendlyPaymentError } from "@/lib/alerts/errors";
import { paymentImage } from "@/lib/payment-image";

export function PaymentProofForm({ bookingId, customerId, amount }: { bookingId: string; customerId: string; amount: number }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [refreshing, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);

  async function submit(form: FormData) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    let attempted = false;
    try {
      const reference = String(form.get("reference") ?? "").trim();
      if (!/^[A-Z0-9]{6,40}$/.test(normalizePaymentReference(reference))) throw new Error("REFERENCE_INVALID");
      const image = await paymentImage(form.get("proof") as File);
      const db = createClient();
      const path = `${customerId}/${bookingId}/${crypto.randomUUID()}.webp`;
      attempted = true;
      const { error: uploadError } = await db.storage.from("payment-proofs").upload(path, image, { contentType: image.type });
      if (uploadError) throw uploadError;
      const { data: id, error: submitError } = await db.rpc("submit_booking_payment", {
        p_booking_id: bookingId, p_reference: reference, p_proof_path: path,
      });
      if (submitError) throw submitError;
      setSubmitted(true);
      startTransition(() => router.refresh());
      void fetch(`/api/payments/${id}/fingerprint`, { method: "POST" }).catch(() => {});
    } catch (cause) {
      const message = friendlyPaymentError(cause);
      if (attempted) {
        try {
          const { data: current } = await createClient().from("bookings").select("status")
            .eq("id", bookingId).eq("customer_id", customerId).maybeSingle();
          if (current && current.status !== "awaiting_payment") {
            if (["payment_review", "confirmed", "picked_up", "returned", "completed"].includes(current.status)) setSubmitted(true);
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
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (submitted) return <p role="status" className="mt-5 rounded-lg bg-amber-50 p-4">Proof sent. The owner is checking your payment.</p>;
  return <form onSubmit={(event) => {
    event.preventDefault();
    if (!busy && !refreshing) void submit(new FormData(event.currentTarget));
  }} aria-busy={busy} className="mt-6 space-y-4 border-t pt-5">
    <h2 className="font-semibold">Submit transfer proof</h2>
    <label className="block text-sm">Amount sent<input readOnly value={paymentPeso(amount)} className="mt-1 block w-full rounded-lg border bg-slate-50 p-3" /></label>
    <label className="block text-sm">Wallet or bank transaction reference
      <input name="reference" required maxLength={100} aria-describedby="reference-help" className="mt-1 block w-full rounded-lg border p-3" />
    </label>
    <figure id="reference-help" className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
      <div aria-hidden="true" className="inline-block rounded border bg-white p-2">Transaction reference <b className="rounded bg-blue-100 p-1">ABC123456</b></div>
      <figcaption className="mt-2">Find the reference in your transfer history. Use 6–40 letters or digits. Spaces and punctuation are ignored.</figcaption>
    </figure>
    <label className="block text-sm">Transfer screenshot (up to 5 MB)
      <input name="proof" type="file" accept="image/jpeg,image/png,image/webp" required className="mt-1 block w-full rounded-lg border p-3" />
    </label>
    {notice && <p role="status" className="text-sm text-slate-700">{notice}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <button disabled={busy || refreshing} className="inline-flex min-h-11 items-center rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-50">
      {busy && <Spinner className="mr-2 size-4 text-white" label="Submitting proof" />}{busy ? "Submitting…" : "Submit payment proof"}
    </button>
  </form>;
}
