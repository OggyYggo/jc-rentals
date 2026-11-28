"use client";
import { runWithAlerts } from "@/lib/alerts/run";
import {useState}from"react";import{useRouter}from"next/navigation";import{createClient}from"@/lib/supabase/client";
import { MobileSettingsEditor, type SettingField } from "./mobile-settings-editor";
type Settings={deposit_percent:number;min_credit_to_list:number;invoice_grace_days:number;platform_account_name:string;platform_qr_path:string;payment_instructions:string};
const paymentFields: Record<"credits" | "invoices" | "platform-payment", SettingField[]> = {
  credits: [{ key: "minimum", label: "Minimum credits to list", type: "number", min: 1, unit: "PHP", description: "Owners on the credits plan need this balance to keep vehicles listed." }],
  invoices: [{ key: "grace", label: "Invoice grace period", type: "number", min: 1, unit: "days", description: "Time owners have to settle a platform invoice." }],
  "platform-payment": [
    { key: "deposit", label: "Default deposit", type: "number", min: 1, max: 100, unit: "%", description: "Default reservation payment for new bookings." },
    { key: "account", label: "Platform payment account name", type: "text" },
    { key: "qr", label: "Platform QR image", type: "file", description: "Leave empty to keep the current image. Choose an image under 10 MB." },
    { key: "instructions", label: "Payment instructions", type: "textarea" },
  ],
};
export function AdminPaymentSettings({ updatedBy, settings, mobileSection }: { updatedBy: string; settings: Settings; mobileSection?: keyof typeof paymentFields }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function persist(data: { get: (key: string) => FormDataEntryValue | null }) {
    setError("");
    const file = data.get("qr");
    const upload = file instanceof File && file.size > 0 ? file : null;
    if (upload && (upload.size > 10 * 1024 * 1024 || !upload.type.startsWith("image/"))) {
      setError("Choose an image under 10 MB.");
      return false;
    }
    const deposit = Number(data.get("deposit")) / 100;
    const instructions = String(data.get("instructions") ?? "");
    const changes = [
      ...(deposit !== settings.deposit_percent ? [`Default deposit ${settings.deposit_percent * 100}% → ${deposit * 100}%. Applies to new bookings only.`] : []),
      ...(instructions !== settings.payment_instructions ? ["The payment instructions shown to customers will be updated."] : []),
      ...(upload ? ["This will replace the platform payment QR."] : []),
    ];
    const result = await runWithAlerts({
      confirm: mobileSection ? undefined : {
        title: "Save platform payment settings?", text: changes.join("\n") || undefined, confirmText: "Save payment settings",
      },
      setPending: setBusy,
      run: async () => {
        const db = createClient();
        let path = settings.platform_qr_path;
        if (upload) {
          path = `platform/${crypto.randomUUID()}.${upload.type === "image/png" ? "png" : "jpg"}`;
          const { error } = await db.storage.from("platform-qr").upload(path, upload, { contentType: upload.type });
          if (error) throw error;
        }
        const entries = {
          deposit_percent: deposit,
          min_credit_to_list: Number(data.get("minimum")),
          invoice_grace_days: Number(data.get("grace")),
          platform_account_name: String(data.get("account") ?? ""),
          platform_qr_path: path,
          payment_instructions: instructions,
        };
        const savedAt = new Date().toISOString();
        const { error } = await db.from("settings").upsert(Object.entries(entries).map(([key, value]) => ({
          key, value, updated_by: updatedBy, updated_at: savedAt,
        })));
        if (error) {
          if (upload && path) await db.storage.from("platform-qr").remove([path]);
          throw error;
        }
      },
      success: "Payment settings saved",
      refresh: router.refresh,
    });
    return result.ok;
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (await persist(new FormData(form))) {
      const input = form.elements.namedItem("qr");
      if (input instanceof HTMLInputElement) input.value = "";
    }
  }

  if (mobileSection) return <>
    <MobileSettingsEditor busy={busy} fields={paymentFields[mobileSection]}
      initial={{ deposit: String(settings.deposit_percent * 100), minimum: String(settings.min_credit_to_list),
        grace: String(settings.invoice_grace_days), account: settings.platform_account_name, qr: null, instructions: settings.payment_instructions }}
      explanation={mobileSection === "platform-payment" ? "The default deposit applies to new bookings only." : undefined}
      onSave={values => persist({ get: key => {
        const value = values[key];
        return value instanceof File ? value : value == null ? null : String(value);
      } })} />
    {error && <p role="alert" className="mt-3 text-sm text-[#A12A2A]">{error}</p>}
  </>;

  return <form onSubmit={save} className="mt-6 max-w-3xl space-y-4 rounded-xl border border-[#e7ecf3] bg-white p-5"><h2 className="text-sm font-semibold">Payments and booking defaults</h2><div className="grid gap-4 sm:grid-cols-2">{[["deposit","Default deposit (%)",settings.deposit_percent*100],["minimum","Minimum credits to list (₱)",settings.min_credit_to_list],["grace","Invoice grace days",settings.invoice_grace_days]].map(([name,label,value])=><label key={String(name)} className="text-xs font-medium">{label}<input name={String(name)} type="number" min="1" max={name==="deposit"?100:undefined} defaultValue={Number(value)} className="mt-1 block w-full rounded-lg border p-2"/></label>)}</div><label className="block text-xs font-medium">Platform payment account name<input name="account" defaultValue={settings.platform_account_name} className="mt-1 block w-full rounded-lg border p-2"/></label><label className="block text-xs font-medium">Platform QR image<input name="qr" type="file" aria-invalid={Boolean(error)} aria-describedby={error ? "platform-qr-error" : undefined} accept="image/*" className="mt-1 block w-full rounded-lg border p-2"/></label><label className="block text-xs font-medium">Payment instructions<textarea name="instructions" defaultValue={settings.payment_instructions} rows={3} className="mt-1 block w-full rounded-lg border p-2"/></label>{error&&<p id="platform-qr-error" role="alert" className="text-sm text-red-700">{error}</p>}<button disabled={busy} className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white">{busy?"Saving…":"Save payment settings"}</button></form>}
