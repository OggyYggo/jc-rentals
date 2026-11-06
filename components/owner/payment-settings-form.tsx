"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
type Settings = { payment_method_label: string | null; payment_account_name: string | null; payment_qr_path: string | null; payment_qr_verified: boolean } | null;
export function OwnerPaymentSettingsForm({ ownerId, settings, qrUrl }: { ownerId: string; settings: Settings; qrUrl: string | null }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  async function save(form: FormData) { setBusy(true); setError(""); setMessage(""); try {
    const supabase = createClient(); const file = form.get("qr") as File; let path = settings?.payment_qr_path ?? null;
    if (file?.size) { if (file.size > 10 * 1024 * 1024 || !file.type.startsWith("image/")) throw new Error("Choose an image under 10 MB."); path = `${ownerId}/${crypto.randomUUID()}.${file.type === "image/png" ? "png" : "jpg"}`; const { error } = await supabase.storage.from("owner-qr").upload(path, file, { contentType: file.type }); if (error) throw error; }
    const { error } = await supabase.from("owners").update({ payment_method_label: String(form.get("method")), payment_account_name: String(form.get("account")), payment_qr_path: path }).eq("id", ownerId); if (error) throw error;
    setMessage("Payment details saved. Cars stay hidden until an administrator verifies the QR."); router.refresh();
  } catch (e) { setError(e instanceof Error ? e.message : "Unable to save payment details."); } finally { setBusy(false); } }
  return <form action={save} className="max-w-2xl space-y-5 rounded-xl border border-[#e7ecf3] bg-white p-5">{settings?.payment_qr_verified ? <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">QR verified</p> : <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">QR not verified. Your public listings remain hidden until admin approval.</p>}<label className="block text-sm">Payment method<input name="method" required defaultValue={settings?.payment_method_label ?? "GCash"} className="mt-1 block w-full rounded-lg border p-2"/></label><label className="block text-sm">Account name<input name="account" required defaultValue={settings?.payment_account_name ?? ""} className="mt-1 block w-full rounded-lg border p-2"/></label>{qrUrl && <img src={qrUrl} alt="Current payment QR" className="max-h-56 rounded-lg border p-2"/>}<label className="block text-sm">QR image<input name="qr" type="file" accept="image/jpeg,image/png,image/webp" className="mt-1 block w-full rounded-lg border p-2"/></label>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}{message && <p className="text-sm text-green-800">{message}</p>}<button disabled={busy} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white">{busy ? "Saving…" : "Save payment details"}</button></form>;
}
