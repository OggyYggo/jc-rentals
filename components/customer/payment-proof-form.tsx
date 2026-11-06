"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function PaymentProofForm({ bookingId, customerId, amount }: { bookingId: string; customerId: string; amount: number }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(form: FormData) {
    setBusy(true); setError("");
    try {
      const file = form.get("proof") as File;
      const reference = String(form.get("reference") ?? "").trim();
      if (!file?.size || file.size > 10 * 1024 * 1024) throw new Error("Choose an image under 10 MB.");
      if (!reference) throw new Error("Enter the transfer reference number.");
      const supabase = createClient();
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0); bitmap.close();
      const webp = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not process this image.")), "image/webp", 0.85));
      const path = `${customerId}/${bookingId}/${crypto.randomUUID()}.webp`;
      const { error: uploadError } = await supabase.storage.from("payment-proofs").upload(path, webp, { contentType: "image/webp", upsert: false });
      if (uploadError) throw uploadError;
      const { error: insertError } = await supabase.from("payments").insert({ booking_id: bookingId, amount, method: "owner_qr", reference_no: reference, proof_path: path });
      if (insertError) { await supabase.storage.from("payment-proofs").remove([path]); throw insertError; }
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not submit payment proof."); }
    finally { setBusy(false); }
  }
  return <form action={submit} className="mt-6 space-y-4 border-t pt-5"><h2 className="font-semibold text-slate-900">Submit transfer proof</h2><label className="block text-sm text-slate-700">Transaction reference<input name="reference" required className="mt-1 block w-full rounded-lg border px-3 py-2"/></label><label className="block text-sm text-slate-700">Screenshot<input name="proof" type="file" accept="image/jpeg,image/png,image/webp" required className="mt-1 block w-full rounded-lg border px-3 py-2"/></label>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<button disabled={busy} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Submitting…" : `I sent ₱${amount.toLocaleString("en-PH")}`}</button></form>;
}
