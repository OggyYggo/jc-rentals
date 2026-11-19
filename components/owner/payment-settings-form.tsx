"use client";
import { runWithAlerts } from "@/lib/alerts/run";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
type Settings = { payment_method_label: string | null; payment_account_name: string | null; payment_qr_path: string | null; payment_qr_verified: boolean } | null;
export function OwnerPaymentSettingsForm({ ownerId, settings, qrUrl }: { ownerId: string; settings: Settings; qrUrl: string | null }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const file = values.get("qr");
    const upload = file instanceof File && file.size > 0 ? file : null;
    setError("");
    if (upload && (upload.size > 10 * 1024 * 1024 || !upload.type.startsWith("image/"))) {
      setError("Choose an image under 10 MB.");
      return;
    }
    const result = await runWithAlerts({
      setPending: setBusy,
      run: async () => {
        const db = createClient();
        let path = settings?.payment_qr_path ?? null;
        if (upload) {
          path = `${ownerId}/${crypto.randomUUID()}.${upload.type === "image/png" ? "png" : "jpg"}`;
          const { error } = await db.storage.from("owner-qr").upload(path, upload, { contentType: upload.type });
          if (error) throw error;
        }
        const { error } = await db.from("owners").update({
          payment_method_label: String(values.get("method")), payment_account_name: String(values.get("account")), payment_qr_path: path,
        }).eq("id", ownerId);
        if (error) throw error;
      },
      success: "Saved. Your QR will be checked before customers can pay you.",
      successType: "info",
      refresh: router.refresh,
    });
    if (result.ok && upload) {
      const input = form.elements.namedItem("qr");
      if (input instanceof HTMLInputElement) input.value = "";
    }
  }
  return <form onSubmit={save} className="max-w-2xl space-y-5 rounded-xl border border-[#e7ecf3] bg-white p-5">{settings?.payment_qr_verified ? <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">QR verified</p> : <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">QR not verified. Your public listings remain hidden until admin approval.</p>}<label className="block text-sm">Payment method<input name="method" required defaultValue={settings?.payment_method_label ?? "GCash"} className="mt-1 block w-full rounded-lg border p-2"/></label><label className="block text-sm">Account name<input name="account" required defaultValue={settings?.payment_account_name ?? ""} className="mt-1 block w-full rounded-lg border p-2"/></label>{qrUrl && <img src={qrUrl} alt="Current payment QR" className="max-h-56 rounded-lg border p-2"/>}<label className="block text-sm">QR image<input name="qr" type="file" aria-invalid={Boolean(error)} aria-describedby={error ? "owner-qr-error" : undefined} accept="image/jpeg,image/png,image/webp" className="mt-1 block w-full rounded-lg border p-2"/></label>{error && <p role="alert" className="text-sm text-red-700" id="owner-qr-error">{error}</p>}<button disabled={busy} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white">{busy ? "Saving…" : "Save payment details"}</button></form>;
}
