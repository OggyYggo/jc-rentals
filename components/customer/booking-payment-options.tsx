"use client";

import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { CopyButton } from "@/components/ui/CopyButton";
import { PaymentProofForm } from "@/components/customer/payment-proof-form";
import { PaymentProviderTile } from "@/components/payment-provider-tile";
import { paymentProviders, type BookingPaymentOption } from "@/lib/payments/providers";

const card = "mt-4 min-w-0 rounded-2xl border border-[#D6E6F7] bg-white p-4 sm:p-5";
const action = "inline-flex min-h-11 items-center justify-center rounded-full border border-[#D6E6F7] px-4 text-sm font-semibold text-[#0A3D91]";
const primary = "min-h-[52px] w-full rounded-full bg-[#0A47B1] px-4 text-sm font-semibold text-white disabled:opacity-50";
const subscribe = () => () => {};

export function BookingPaymentOptions({ options, bookingId, customerId, reference, amount, retry, children }: {
  options: BookingPaymentOption[];
  bookingId: string;
  customerId: string;
  reference: string;
  amount: number;
  retry: boolean;
  children: ReactNode;
}) {
  const key = `booking-payment-option:${bookingId}`;
  const saved = useSyncExternalStore(subscribe, () => {
    try { return sessionStorage.getItem(key); } catch { return null; }
  }, () => null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [choice, setChoice] = useState("");
  const [showProof, setShowProof] = useState(false);
  const selected = options.length === 1 ? options[0] : options.find(option => option.id === (activeId ?? saved));

  function select(id: string) {
    setActiveId(id);
    setShowProof(false);
    try { sessionStorage.setItem(key, id); } catch { /* The current choice stays in memory. */ }
  }

  return <>
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
    </section>}
    {selected && <>
      {options.length > 1 && <div aria-label="Payment options" className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {options.map(option => <button key={option.id} type="button" aria-pressed={selected.id === option.id}
          onClick={() => { if (selected.id !== option.id) select(option.id); }}
          className={`${action} shrink-0 whitespace-nowrap aria-pressed:border-[#0A47B1] aria-pressed:bg-[#EAF4FF]`}>{option.label}</button>)}
      </div>}
      <ScanPaymentOption key={selected.id} option={selected} bookingId={bookingId} reference={reference} />
      {!showProof && <button className={`mt-4 ${primary}`} type="button" onClick={() => setShowProof(true)}>I paid, send proof</button>}
    </>}
    {children}
    {((selected && showProof) || (retry && !options.length)) && <PaymentProofForm
      key={selected?.id ?? "retry"} bookingId={bookingId} customerId={customerId} amount={amount} paymentOptionId={selected?.id} />}
  </>;
}

function ScanPaymentOption({ option, bookingId, reference }: { option: BookingPaymentOption; bookingId: string; reference: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [appError, setAppError] = useState(false);
  const brand = paymentProviders[option.provider];
  const app = option.provider === "other_qrph" ? "your e-wallet or bank app" : `the ${brand.label} app`;

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
        <div className="min-w-0 break-words"><h2 className="font-semibold">{option.label}</h2>
          <p className="text-sm">{option.account_name}{option.account_hint && ` · ${option.account_hint}`}</p>
        </div>
      </div>
      {option.qrUrl ? <>
        <button type="button" aria-label={`Enlarge ${option.label} payment QR`} className="mx-auto my-4 block rounded-xl border p-2" onClick={() => dialog.current?.showModal()}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={option.qrUrl} alt={`${option.label} payment QR`} className="size-44 object-contain" />
        </button>
        <dialog ref={dialog} aria-label={`${option.label} payment QR`} className="m-auto w-[min(90vw,26rem)] rounded-2xl p-4 backdrop:bg-black/60">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={option.qrUrl} alt={`${option.label} payment QR`} className="aspect-square w-full object-contain" />
          <form method="dialog" className="mt-3 text-center"><button className={action}>Close</button></form>
        </dialog>
        <div className="flex flex-wrap justify-center gap-2">
          {brand.appLink && <button type="button" className={action} onClick={openApp}>Open {brand.label} app</button>}
          <a className={action} href={`/account/bookings/${bookingId}/pay/qr?option=${option.id}`}>Download QR</a>
        </div>
        {appError && <p role="status" className="mt-2 text-sm">Could not open the app. Save the QR and scan it from your gallery.</p>}
      </> : <p role="status" className="mt-2 text-sm text-red-800">This payment QR is unavailable. Try refreshing the page or contact support before sending money.</p>}
    </section>
    <section className={card}>
      <h2 className="font-semibold">How to pay</h2>
      <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-[#5B6F89]">
        <li>Open {app} and tap Pay QR.</li>
        <li>Scan or upload the QR, check the account name and enter the exact amount.</li>
        <li>Add the booking reference as a note. Keep a screenshot of your transfer.</li>
      </ol>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="break-all">Booking reference · {reference}</span>
        <CopyButton mobileTouch label="Copy reference" value={reference} />
      </div>
      <p className="mt-2 text-sm text-[#5B6F89]">Your proof records which option you used.</p>
    </section>
  </>;
}
