"use client";

import { useConnectionStatus } from "@/lib/connection/provider";
import { UploadPaused } from "@/components/loading/UploadPaused";
import Image from "next/image";
import { Camera, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { paymentPeso } from "@/lib/payment-format";
import { onlineTopupError, openOnlineTopup, useCheckoutPending } from "../online-topup";
import { submitCreditProof } from "../submit-credit-proof";
import { CreditsHeading } from "./navigation";
import { chip, creditsHref, field, focus, panel, primary, qrHref, screen, topUpHref } from "./styles";

const presets = [500, 1000, 2000];
const channels = { gcash: "GCash", maya: "Maya", gotyme: "GoTyme", other: "Other" };
type Method = "online" | "qr";

export function MobileTopUp({ available, online }: {
  available: number; online: { minimum: number; maximum: number } | null;
}) {
  const router = useRouter();
  const offline = useConnectionStatus() === "offline";
  const [uncertain, setUncertain] = useState(false);
  const [method, setMethod] = useState<Method>(online ? "online" : "qr");
  const [channel, setChannel] = useState<keyof typeof channels>("other");
  const [preset, setPreset] = useState<number | "other">(online && (500 < online.minimum || 500 > online.maximum) ? "other" : 500);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useCheckoutPending();
  const [error, setError] = useState("");
  const amount = preset === "other" ? Number(custom) : preset;

  function selectMethod(next: Method) {
    setMethod(next);
    setError("");
    if (next === "online" && online && preset !== "other" && (preset < online.minimum || preset > online.maximum)) {
      setPreset("other");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || offline || (uncertain && method === "online")) return;
    if (method === "online" && online && (!Number.isSafeInteger(amount) || amount < online.minimum || amount > online.maximum)) {
      setError(`Choose a whole-peso amount between ${paymentPeso(online.minimum)} and ${paymentPeso(online.maximum)}.`);
      return;
    }
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      setError("Enter a whole-peso amount greater than zero.");
      return;
    }
    setError("");
    if (method === "qr") {
      router.push(`${qrHref}?amount=${amount}`);
      return;
    }
    setBusy(true);
    try {
      const message = await openOnlineTopup(amount, channel, () => setUncertain(true));
      if (message) setError(message);
    } catch {
      setError(onlineTopupError);
    } finally {
      setBusy(false);
    }
  }

  return <div className={screen}>
    <CreditsHeading back="Credits" href={creditsHref} title="Top up credits" description="Choose an amount and how to pay." />
    <form noValidate onSubmit={submit} className="space-y-5">
      <fieldset disabled={busy} className={panel}>
        <legend className="px-1 font-heading font-bold">Amount</legend>
        <div className="flex flex-wrap gap-2">
          {presets.map(value => <button key={value} type="button" aria-pressed={preset === value} className={`${chip(preset === value)} disabled:opacity-50`}
            disabled={method === "online" && !!online && (value < online.minimum || value > online.maximum)}
            onClick={() => { setPreset(value); setError(""); }}>{paymentPeso(value).replace(/\.00$/, "")}</button>)}
          <button type="button" aria-pressed={preset === "other"} className={chip(preset === "other")}
            onClick={() => { setPreset("other"); setError(""); }}>Other</button>
        </div>
        {preset === "other" && <label className="mt-3 block text-sm font-semibold">
          Amount in pesos
          <input value={custom} onChange={event => { setCustom(event.target.value); setError(""); }} className={field}
            type="number" inputMode="numeric" step="1" min={method === "online" ? online?.minimum : 1}
            max={method === "online" ? online?.maximum : undefined} />
        </label>}
        <div className="mt-4 rounded-xl bg-[#F3F9FF] p-3 text-sm">
          <p className="text-[#5B6F89]">Your balance after top-up</p>
          <p className="mt-1 break-words font-heading text-lg font-bold">{paymentPeso(available + (amount > 0 && Number.isSafeInteger(amount) ? amount : 0))}</p>
        </div>
      </fieldset>

      <div className="space-y-2">
        <h2 id="topup-method-label" className="font-heading font-bold">How to pay</h2>
        <div role={online ? "radiogroup" : undefined} aria-labelledby={online ? "topup-method-label" : undefined} className="space-y-2">
          {online && <PaymentMethod method="online" selected={method === "online"} select={selectMethod} busy={busy}>
            {method === "online" && <fieldset disabled={busy} className="px-4 pb-4">
              <legend className="mb-2 text-sm font-semibold">Pay with</legend>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(channels) as (keyof typeof channels)[]).map(value => <button key={value}
                  type="button" aria-pressed={channel === value} className={chip(channel === value)}
                  onClick={() => { setChannel(value); setError(""); }}>{channels[value]}</button>)}
              </div>
            </fieldset>}
          </PaymentMethod>}
          <PaymentMethod method="qr" selected={method === "qr"} select={online ? selectMethod : undefined} busy={busy} />
        </div>
      </div>
      {uncertain && <a href={creditsHref} className={primary}>Check credits</a>}
      {error && <p role="alert" className="text-sm text-[#A12A2A]">{error}</p>}
      <button disabled={busy || offline || uncertain} className={primary.replace("min-h-[52px]", "min-h-[54px]")}>
        {busy && <LoaderCircle size={18} className="motion-safe:animate-spin" aria-hidden />}
        {busy ? "Opening payment…" : offline ? "Needs internet to continue" : "Continue to payment"}
      </button>
      <p className="text-center text-xs text-[#5B6F89]">Secure payment. We never see your card or wallet PIN.</p>
    </form>
  </div>;
}

function PaymentMethod({ method, selected, select, busy, children }: {
  method: Method; selected: boolean; select?: (method: Method) => void; busy: boolean; children?: ReactNode;
}) {
  const online = method === "online";
  const title = online ? "Pay online" : "Scan QR and upload proof";
  const description = online
    ? "GCash, Maya, GoTyme or bank. Credits are added in about a minute."
    : "Pay our QR, then send your reference and screenshot. Credits are added after review.";
  const content = <span className="min-w-0">
    <span className="flex flex-wrap items-center gap-2">
      <span id={`${method}-method-title`} className="font-heading font-bold">{title}</span>
      <span className="rounded-full bg-[#EAF4FF] px-2 py-1 text-xs font-semibold text-[#0A47B1]">{online ? "Fastest" : "Same day"}</span>
    </span>
    <span id={`${method}-method-description`} className="mt-1 block text-sm text-[#5B6F89]">{description}</span>
  </span>;
  if (!select) return <div className={panel}>{content}</div>;
  return <div className={`rounded-2xl border ${selected ? "border-[#0A47B1] bg-[#F3F9FF]" : "border-[#E3EEF9] bg-white"}`}>
    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl p-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[#0A47B1]">
      <input type="radio" name="payment-method" checked={selected} disabled={busy} onChange={() => select(method)}
      aria-labelledby={`${method}-method-title`} aria-describedby={`${method}-method-description`}
      className="mt-1 size-4 shrink-0 accent-[#0A47B1]" />
      {content}
    </label>
    {children}
  </div>;
}

export function MobileQrTopUp({ ownerId, amount, accountName, qrUrl }: {
  ownerId: string; amount: number | null; accountName: string; qrUrl: string | null;
}) {
  const router = useRouter();
  const offline = useConnectionStatus() === "offline";
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [paused, setPaused] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [paid, setPaid] = useState(amount?.toString() ?? "");
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  async function submit(form: HTMLFormElement) {
    if (!qrUrl || busy || offline || uncertain) return;
    setError("");
    setPaused(false);
    const result = await submitCreditProof(form, ownerId, setError, setBusy, undefined,
      () => setPaused(true), () => setUncertain(true));
    if (result.ok) {
      router.replace(creditsHref);
      router.refresh();
    }
  }

  return <div className={screen}>
    <CreditsHeading back="Top up credits" href={topUpHref} title="Pay by QR" description="Scan the QR, then send your payment proof." />
    <div aria-hidden className="grid grid-cols-3 gap-2">
      <span className="h-1.5 rounded-full bg-[#D6E6F7]" />
      <span className="h-1.5 rounded-full bg-[#0A47B1]" />
      <span className="h-1.5 rounded-full bg-[#D6E6F7]" />
    </div>
    <section className={panel}>
      <h2 className="break-words font-heading font-bold">1 · Scan and pay{Number(paid) > 0 ? ` ${paymentPeso(Number(paid))}` : ""}</h2>
      {qrUrl ? <>
        <Image src={qrUrl} alt="Platform top-up QR" width={224} height={224} unoptimized
          className="mx-auto my-4 h-auto max-w-full rounded-xl border border-[#E3EEF9] bg-white p-2" />
        <p className="text-center font-semibold">{accountName || "Platform account"}</p>
        <p className="text-center text-sm text-[#5B6F89]">GCash, Maya or any QR Ph app</p>
      </> : <p role="status" className="mt-2 text-sm text-[#8A5A00]">Payment QR is not available yet. Contact support.</p>}
    </section>
    <form ref={formRef} onSubmit={event => {
      event.preventDefault();
      void submit(event.currentTarget);
    }}>
      <fieldset disabled={!qrUrl || busy} className={`${panel} space-y-3 disabled:opacity-60`}>
        <legend className="px-1 font-heading font-bold">2 · Send your proof</legend>
        <label className="block text-sm font-semibold">Amount paid
          <input name="amount" type="number" min="1" step="0.01" inputMode="decimal" required value={paid}
            onChange={event => setPaid(event.target.value)} className={field} />
        </label>
        <label className="block text-sm font-semibold">Transfer reference
          <input name="reference" required className={field} />
        </label>
        <div className="relative rounded-xl border border-dashed border-[#D6E6F7] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#0A47B1]">
          <label className={`flex min-h-14 items-center gap-3 p-3 text-sm font-semibold text-[#0A47B1] ${focus}`}>
            {preview ? <Image src={preview} alt="Selected payment proof" width={48} height={48} unoptimized className="size-12 rounded-lg object-cover" />
              : <Camera size={20} aria-hidden />}
            <span>{preview ? "Change photo" : "Choose screenshot"}</span>
            <input ref={fileRef} name="proof" type="file" accept="image/*" required
              onChange={event => {
                const file = event.target.files?.[0];
                setFileName(file?.name ?? "");
                setPaused(false);
                setPreview(file ? URL.createObjectURL(file) : "");
              }} className="absolute inset-0 w-full cursor-pointer opacity-0" />
          </label>
        </div>
        {error && <p role="alert" className="text-sm text-[#A12A2A]">{error}</p>}
        {fileName && (offline || paused) && !uncertain && <UploadPaused fileName={fileName} busy={busy}
          onRetry={() => { if (formRef.current?.reportValidity()) void submit(formRef.current); }}
          onCancel={() => { setPaused(false); setFileName(""); setPreview(""); if (fileRef.current) fileRef.current.value = ""; }} />}
        {uncertain && <a href={creditsHref} className={primary}>Check credits</a>}
        <button disabled={offline || uncertain || paused} className={primary}>{busy ? "Submitting…" : offline ? "Needs internet to continue" : "Submit for review"}</button>
        <p className="text-center text-xs text-[#5B6F89]">Credits are added after we check it, usually the same day.</p>
      </fieldset>
    </form>
  </div>;
}
