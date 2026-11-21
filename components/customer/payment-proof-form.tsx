"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/loading/Spinner";
import { normalizePaymentReference, paymentPeso } from "@/lib/payment-format";
import { paymentImage } from "@/lib/payment-image";

const messages: Record<string, string> = {
  REFERENCE_ALREADY_USED: "That transaction reference has already been used for this owner.",
  REFERENCE_INVALID: "Enter a wallet or bank reference with 6 to 40 letters or digits.",
  PAYMENT_WINDOW_EXPIRED: "The payment window has passed. If you already paid, contact support.",
  PROOF_LIMIT: "This booking has reached its three-proof limit.",
};

export function PaymentProofForm({ bookingId, customerId, amount }: { bookingId: string; customerId: string; amount: number }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submit(form: FormData) {
    setBusy(true);
    setError("");
    try {
      const reference = String(form.get("reference") ?? "").trim();
      if (!/^[A-Z0-9]{6,40}$/.test(normalizePaymentReference(reference))) throw new Error("REFERENCE_INVALID");
      const image = await paymentImage(form.get("proof") as File);
      const db = createClient();
      const path = `${customerId}/${bookingId}/${crypto.randomUUID()}.webp`;
      const { error: uploadError } = await db.storage.from("payment-proofs").upload(path, image, { contentType: image.type });
      if (uploadError) throw uploadError;
      const { data: id, error: submitError } = await db.rpc("submit_booking_payment", {
        p_booking_id: bookingId, p_reference: reference, p_proof_path: path,
      });
      if (submitError) throw submitError;
      setSubmitted(true);
      await fetch(`/api/payments/${id}/fingerprint`, { method: "POST" }).catch(() => {});
      router.refresh();
    } catch (cause) {
      const message = cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "";
      setError(messages[message] ?? (cause instanceof Error ? cause.message : "Could not submit the proof. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  if (submitted) return <p role="status" className="mt-5 rounded-lg bg-amber-50 p-4">The owner is checking your payment. You will get an email and notification.</p>;
  return <form onSubmit={(event) => {
    event.preventDefault();
    if (!busy) void submit(new FormData(event.currentTarget));
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
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <button disabled={busy} className="inline-flex min-h-11 items-center rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-50">
      {busy && <Spinner className="mr-2 size-4 text-white" label="Submitting proof" />}{busy ? "Submitting…" : "Submit payment proof"}
    </button>
  </form>;
}
