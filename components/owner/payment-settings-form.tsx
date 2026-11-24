"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { PaymentProviderTile } from "@/components/payment-provider-tile";
import { SubmitButton } from "@/components/loading/SubmitButton";
import { runWithAlerts } from "@/lib/alerts/run";
import { paymentProviders, type ManagedPaymentOption, type PaymentProvider } from "@/lib/payments/providers";
import { createClient } from "@/lib/supabase/client";

type Option = ManagedPaymentOption & { qrUrl: string | null };
const action = "inline-flex min-h-11 items-center gap-1 rounded-lg border px-3 text-sm font-semibold text-blue-800 disabled:opacity-50";
const field = "mt-1 block min-h-11 w-full rounded-lg border px-3 py-2";

export function OwnerPaymentSettingsForm({ ownerId, options }: { ownerId: string; options: Option[] }) {
  const router = useRouter();
  const [editor, setEditor] = useState<{ option?: Option; replace?: boolean } | null>(null);
  const [provider, setProvider] = useState<PaymentProvider>("gcash");
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");

  function edit(option?: Option, replace = false) {
    setEditor({ option, replace });
    setProvider(option?.provider ?? "gcash");
    setError("");
  }

  function changeOption(id: string, actionName: string, run: () => PromiseLike<{ error: unknown }>, confirm?: { title: string; confirmText: string; danger: boolean }) {
    return runWithAlerts({
      confirm,
      setPending: busy => setPending(busy ? `${id}:${actionName}` : ""),
      run: async () => {
        const { error } = await run();
        if (error) throw error;
      },
      refresh: router.refresh,
    });
  }

  function reorder(index: number, direction: number) {
    const ids = options.map(option => option.id);
    const id = ids[index];
    ids.splice(index, 1);
    ids.splice(index + direction, 0, id);
    return changeOption(id, direction < 0 ? "up" : "down",
      () => createClient().rpc("owner_reorder_payment_options", { p_ids: ids }));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !editor) return;
    setError("");
    const values = new FormData(event.currentTarget);
    const file = values.get("qr");
    const upload = file instanceof File && file.size > 0 ? file : null;
    const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
    if (upload && (upload.size > 10 * 1024 * 1024 || !extensions[upload.type])) {
      setError("Choose a JPG, PNG or WebP image up to 10 MB.");
      return;
    }
    const result = await runWithAlerts({
      setPending: busy => setPending(busy ? "save" : ""),
      run: async () => {
        const db = createClient();
        let path = editor.option?.qr_path;
        if (upload) {
          path = `${ownerId}/${crypto.randomUUID()}.${extensions[upload.type]}`;
          const { error } = await db.storage.from("owner-qr").upload(path, upload, { contentType: upload.type });
          if (error) throw error;
        }
        if (!path) throw new Error("Choose a QR image uploaded to your account.");
        const { error } = await db.rpc("owner_save_payment_option", {
          p_option_id: editor.option?.id ?? null,
          p_provider: provider,
          p_label: provider === "other_qrph" ? String(values.get("label")) : paymentProviders[provider].label,
          p_account_name: String(values.get("account")),
          p_account_hint: String(values.get("hint")),
          p_qr_path: path,
          p_make_preferred: values.has("preferred"),
        });
        if (error) throw error;

      },
      success: "Payment option saved",
      refresh: router.refresh,
    });
    if (result.ok) setEditor(null);
  }

  const option = editor?.option;
  const spinner = (id: string, name: string) => pending === `${id}:${name}` && <LoaderCircle aria-hidden="true" size={16} className="animate-spin" />;

  return <div className="max-w-2xl space-y-4">
    <p className="text-sm text-slate-600">Add every account you can receive money in. Each QR is checked by the Kuyog Bohol admin before customers see it.</p>
    {!options.some(option => option.verified) && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Customers can pay and you can accept bookings once an admin verifies a payment option.</p>}
    {options.map((option, index) => <article key={option.id} className="space-y-3 rounded-xl border bg-white p-4">
      <div className="flex items-start gap-3">
        <PaymentProviderTile provider={option.provider} />
        <div className="min-w-0 flex-1 break-words">
          <h2 className="font-semibold">{option.label}</h2>
          <p className="text-sm">{option.account_name}{option.account_hint && ` · ${option.account_hint}`}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
            {option.is_preferred && <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-800">Preferred</span>}
            <span className={`rounded-full px-2 py-1 ${option.verified ? "bg-green-50 text-green-800" : option.rejection_reason ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}>
              {option.verified ? "Verified" : option.rejection_reason ? `Rejected: ${option.rejection_reason}` : "Under review"}
            </span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={Boolean(pending)} className={action} onClick={() => edit(option,true)}>Replace QR</button>
        <button type="button" disabled={Boolean(pending)} className={action} onClick={() => edit(option)}>Edit</button>
        {!option.is_preferred && <button type="button" disabled={Boolean(pending)} className={action} onClick={() => changeOption(option.id,"prefer",
          () => createClient().rpc("owner_set_preferred_payment_option", { p_option_id: option.id }))}>{spinner(option.id,"prefer")}Make preferred</button>}
        <button type="button" disabled={Boolean(pending)} className={action} onClick={() => changeOption(option.id,"remove",
          () => createClient().rpc("owner_remove_payment_option", { p_option_id: option.id }),
          { title: `Remove ${option.label}?`, confirmText: "Remove", danger: true })}>{spinner(option.id,"remove")}Remove</button>
        {index > 0 && <button type="button" disabled={Boolean(pending)} className={action} onClick={() => reorder(index,-1)}>{spinner(option.id,"up")}Move up</button>}
        {index < options.length - 1 && <button type="button" disabled={Boolean(pending)} className={action} onClick={() => reorder(index,1)}>{spinner(option.id,"down")}Move down</button>}
      </div>
    </article>)}
    <button type="button" className={action} disabled={Boolean(pending) || options.length >= 8} onClick={() => edit()}>+ Add payment option</button>
    {editor && <form key={`${option?.id ?? "new"}:${editor.replace}`} onSubmit={save} className="space-y-4 rounded-xl border bg-white p-4" aria-busy={pending === "save"}>
      <h2 className="font-semibold">{editor.replace ? "Replace QR" : option ? "Edit payment option" : "Add payment option"}</h2>
      <label className="block text-sm">Provider<select className={field} value={provider} onChange={event => setProvider(event.target.value as PaymentProvider)}>
        {Object.entries(paymentProviders).map(([id, brand]) => <option key={id} value={id}>{brand.label}</option>)}
      </select></label>
      <label className="block text-sm">Label
        {provider === "other_qrph" ? <input className={field} name="label" required maxLength={80} defaultValue={option?.provider === provider ? option.label : paymentProviders[provider].label} />
          : <input className={field} value={paymentProviders[provider].label} readOnly />}
      </label>
      <label className="block text-sm">Account name<input className={field} name="account" defaultValue={option?.account_name} maxLength={120} required /></label>
      <label className="block text-sm">Last 4 digits (optional)<input className={field} name="hint" inputMode="numeric" maxLength={4}
        pattern="[0-9]{4}" defaultValue={option?.account_hint?.slice(-4)} /></label>
      {option?.qrUrl && <a className={action} href={option.qrUrl} target="_blank" rel="noreferrer">View current QR</a>}
      <label className="block text-sm">QR image<input className={field} type="file" name="qr" accept="image/jpeg,image/png,image/webp"
        required={!option || editor.replace} /></label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="preferred" defaultChecked={option?.is_preferred}
        disabled={option?.is_preferred} /> Make preferred</label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <SubmitButton busy={pending === "save"} disabled={Boolean(pending)} pendingText="Saving…" className="min-h-11">Save option</SubmitButton>
        <button type="button" disabled={Boolean(pending)} className={action} onClick={() => setEditor(null)}>Cancel</button>
      </div>
    </form>}
    <p className="text-sm text-slate-600">Only verified options are shown to customers. Changing a QR sends it back to review.</p>
  </div>;
}
