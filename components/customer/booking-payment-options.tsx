"use client";

import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { CopyButton } from "@/components/ui/CopyButton";
import { PaymentProofForm } from "@/components/customer/payment-proof-form";
import { PaymentProviderTile } from "@/components/payment-provider-tile";
import { paymentProviders, type BookingPaymentOption } from "@/lib/payments/providers";
import { CustomerQrTip } from "@/components/onboarding/customer-tips";

const card = "mt-4 min-w-0 rounded-2xl border border-[#D6E6F7] bg-white p-4 sm:p-5";
const action = "inline-flex min-h-11 items-center justify-center rounded-full border border-[#D6E6F7] px-4 text-sm font-semibold text-[#0A3D91]";
const primary = "min-h-[52px] w-full rounded-full bg-[#0A47B1] px-4 text-sm font-semibold text-white disabled:opacity-50";
const subscribe = () => () => {};

function PaymentSteps({ proof, className }: { proof: boolean; className: string }) {
  const step = "rounded-full px-3 py-2 aria-current:bg-[#EAF4FF] aria-current:text-[#0A3D91]";
  return <ol aria-label="Payment steps" className={`mb-4 flex flex-wrap gap-2 text-sm font-semibold ${className}`}>
    <li aria-current={!proof ? "step" : undefined} className={step}>1 Pay</li>
    <li aria-current={proof ? "step" : undefined} className={step}>2 Send proof</li>
  </ol>;
}

export function BookingPaymentOptions({ options, bookingId, customerId, reference, amount, retry, paySummary, children }: {
  options: BookingPaymentOption[];
  bookingId: string;
  customerId: string;
  reference: string;
  amount: number;
  retry: boolean;
  paySummary: ReactNode;
  children: ReactNode;
}) {
  const key = `booking-payment-option:${bookingId}`;
  const saved = useSyncExternalStore(subscribe, () => {
    try { return sessionStorage.getItem(key); } catch { return null; }
  }, () => null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [choice, setChoice] = useState("");
  const showProof = useSearchParams().get("step") === "proof";
  const [proofChosen, setProofChosen] = useState(false);
  const selected = options.length === 1 ? options[0] : options.find(option => option.id === (activeId ?? saved));

  function select(id: string) {
    setActiveId(id);
    setProofChosen(false);
    try { sessionStorage.setItem(key, id); } catch { /* The current choice stays in memory. */ }
  }

  const canSend = Boolean(selected || (retry && !options.length));
  const proofStep = showProof && canSend;
  function openProof() {
    const url = new URL(window.location.href);
    url.searchParams.set("step", "proof");
    window.history.pushState({ kuyogPaymentStep: true }, "", url);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  return <>
    <h1 className="sr-only">{proofStep ? "Send proof" : "Pay deposit"}</h1>
    <PaymentSteps proof={proofStep} className="md:hidden" />
    <PaymentSteps proof={proofChosen} className="hidden md:flex" />
    <div className="grid min-w-0 items-start gap-5 md:grid-cols-2">
      <div className={`min-w-0 ${proofStep ? "hidden md:block" : ""}`}>
        {paySummary}
        {options.length === 0 && <p role="status" className={card}>The owner’s payment QR is unavailable. If you already paid, check your transfer history and contact support for help.</p>}
        {options.length > 0 && !selected && <section className={card}>
          <fieldset>
            <legend className="font-semibold">Pay with</legend>
            <div className="mt-3 space-y-2">
              {options.map(option => <label key={option.id} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-[#D6E6F7] px-3 py-2 has-checked:border-[#0A47B1] has-checked:bg-[#EAF4FF]">
                <PaymentProviderTile provider={option.provider} />
                <span className="min-w-0 flex-1 break-words text-sm">
                  <strong className="block">{option.label}</strong>
                  {option.account_name}{option.account_hint && ` · ${option.account_hint}`}
                </span>
                <input type="radio" name="payment-option" value={option.id} checked={choice === option.id}
                  onChange={() => setChoice(option.id)} className="size-5 accent-[#0A47B1]" />
              </label>)}
            </div>
          </fieldset>
          <button type="button" className={`mt-4 ${primary}`} disabled={!options.some(option => option.id === choice)} onClick={() => select(choice)}>Continue</button>
          {!choice && <p className="mt-1 text-center text-sm text-[#5B6F89]">Choose a payment option to continue.</p>}
        </section>}
        {selected && <>
          {options.length > 1 && <div aria-label="Payment options" className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {options.map(option => <button key={option.id} type="button" aria-pressed={selected.id === option.id}
              onClick={() => { if (selected.id !== option.id) select(option.id); }}
              className={`${action} shrink-0 whitespace-nowrap aria-pressed:border-[#0A47B1] aria-pressed:bg-[#EAF4FF]`}>{option.label}</button>)}
          </div>}
          <ScanPaymentOption key={selected.id} option={selected} bookingId={bookingId} showTip={!retry && !proofStep} />
        </>}
      </div>
      <div className={`min-w-0 space-y-4 ${proofStep ? "" : "max-md:contents"}`}>
        {canSend && <div className={proofStep ? "" : "hidden md:block"}>
          <PaymentProofForm key={selected?.id ?? "retry"} bookingId={bookingId} customerId={customerId}
            amount={amount} paymentOptionId={selected?.id} onProofChosen={setProofChosen} />
        </div>}
        <div className={`space-y-3 ${proofStep ? "hidden md:block" : ""}`}>
          <details className="rounded-2xl border border-[#D6E6F7] bg-white px-4">
            <summary className="min-h-11 cursor-pointer py-3 font-semibold">How to pay</summary>
            <ol className="list-decimal space-y-2 pb-4 pl-5 text-sm text-[#5B6F89]">
              <li>Open your wallet or bank app and tap Pay QR.</li>
              <li>Scan the QR and pay the exact amount.</li>
              <li>Take a screenshot of your receipt.</li>
            </ol>
          </details>
          <details className="rounded-2xl border border-[#D6E6F7] bg-white px-4">
            <summary className="min-h-11 cursor-pointer py-3 font-semibold">Booking details</summary>
            <div className="pb-4">{children}</div>
          </details>
        </div>
      </div>
    </div>
    {canSend && !proofStep && <div className="sticky bottom-0 z-10 mt-4 border-t border-[#E3EEF9] bg-[#F3F9FF] pt-2 pb-[max(.5rem,env(safe-area-inset-bottom))] md:hidden">
      <button className={primary} type="button" onClick={openProof}>I paid, send proof</button>
      <div className="flex flex-wrap items-center justify-center gap-x-2 text-sm"><span className="break-all">Reference {reference}</span><CopyButton mobileTouch label="Copy reference" value={reference} /></div>
    </div>}
    <div className="mt-3 hidden flex-wrap items-center gap-2 text-sm md:flex"><span className="break-all">Reference {reference}</span><CopyButton label="Copy reference" value={reference} /></div>
  </>;
}

function ScanPaymentOption({ option, bookingId, showTip }: { option: BookingPaymentOption; bookingId: string; showTip: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [appError, setAppError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const brand = paymentProviders[option.provider];

  function openApp() {
    if (!brand.appLink) return;
    setAppError(false);
    const cancel = () => {
      window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    const onVisibility = () => { if (document.hidden) cancel(); };
    const timeout = window.setTimeout(() => {
      cancel();
      setAppError(true);
    }, 1500);
    document.addEventListener("visibilitychange", onVisibility);
    try { window.location.assign(brand.appLink); } catch { cancel(); setAppError(true); }
  }

  return <>
    <section className={card}>
      <div className="flex items-center gap-3">
        <PaymentProviderTile provider={option.provider} />
        <div className="min-w-0 break-words"><h2 className="font-semibold">{option.label} · {option.account_name}</h2>
          {option.account_hint && <p className="text-sm">{option.account_hint}</p>}
        </div>
      </div>
      {option.qrUrl ? <>
        <button type="button" aria-label={`Enlarge ${option.label} payment QR`} className="mx-auto my-4 block rounded-xl border p-2" onClick={() => dialog.current?.showModal()}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={option.qrUrl} alt={`${option.label} payment QR`} className="size-44 object-contain"
            onLoad={() => setLoaded(true)} onError={() => setLoaded(false)} />
        </button>
        <dialog ref={dialog} aria-label={`${option.label} payment QR`} className="m-auto w-[min(90vw,26rem)] rounded-2xl p-4 backdrop:bg-black/60">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={option.qrUrl} alt={`${option.label} payment QR`} className="aspect-square w-full object-contain" />
          <form method="dialog" className="mt-3 text-center"><button className={action}>Close</button></form>
        </dialog>
        <div className="flex flex-wrap justify-center gap-2">
          {brand.appLink && <button type="button" className={action} onClick={openApp}>Open {brand.label} app</button>}
          <a className={action} href={`/account/bookings/${bookingId}/pay/qr?option=${option.id}`}>Save QR</a>
        </div>
        {appError && <p role="status" className="mt-2 text-sm">Could not open the app. Save the QR and scan it from your gallery.</p>}
      </> : <p role="status" className="mt-2 text-sm text-red-800">This payment QR is unavailable. Try refreshing the page or contact support before sending money.</p>}
    </section>
    <CustomerQrTip kind="payment" eligible={Boolean(option.qrUrl && loaded && showTip && !appError)} />
  </>;
}
