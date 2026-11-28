"use client";

import { useRef, useState } from "react";
import { CalendarDays, Clock, ClipboardCheck, QrCode, Receipt, WalletCards } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { onboardingCopy } from "@/lib/onboarding/content";
import { paymentPeso } from "@/lib/payment-format";
import { LanguageToggle, primary, secondary, useOnboardingLanguage } from "./shared";

export type TourSettings = { invoice: boolean; minimum: number | null; reviewHours: number | null };

export function OwnerTour({ settings, onClose, onFinish }: {
  settings: TourSettings;
  onClose: () => void;
  onFinish: () => void;
}) {
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const language = useOnboardingLanguage();
  const copy = onboardingCopy[language];

  function goTo(index: number) {
    setStep(index);
    if (index === 3) onFinish();
    requestAnimationFrame(() => heading.current?.focus());
  }

  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-[70] bg-[#0F2342]/50" />
      <Dialog.Popup lang={language} aria-modal="true" initialFocus={heading}
        className="fixed inset-x-0 bottom-0 z-[71] max-h-[calc(100dvh-4.5rem)] overflow-y-auto overscroll-contain rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] font-body text-sm text-[#0F2342] shadow-xl sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(560px,calc(100%-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-2"><LanguageToggle language={language} /><Dialog.Close className={secondary}>{copy.skip}</Dialog.Close></div>
        <Dialog.Title ref={heading} tabIndex={-1} className="font-heading text-xl font-bold focus:outline-none">{copy.tourTitles[step]}</Dialog.Title>
        <div className="my-4 space-y-3 rounded-xl border border-[#E3EEF9] bg-[#F3F9FF] p-4">
          {step === 0 ? <ol className="grid gap-3 sm:grid-cols-3">{[CalendarDays, Receipt, ClipboardCheck].map((Icon, index) =>
            <li key={index} className="flex items-center gap-2 sm:flex-col sm:items-start"><Icon size={22} className="shrink-0 text-[#0A47B1]" aria-hidden />{copy.tourFlow[index]}</li>
          )}</ol> : step === 1 ? <>
            <WalletCards size={28} className="text-[#0A47B1]" aria-hidden />
            <p>{settings.invoice ? copy.invoice : settings.minimum === null ? copy.creditsFallback : copy.credits(paymentPeso(settings.minimum))}</p>
          </> : step === 2 ? <>
            <QrCode size={28} className="text-[#0A47B1]" aria-hidden /><p>{copy.pickup}</p>
          </> : <>
            {settings.reviewHours !== null && <p className="inline-flex items-center gap-2 rounded-full bg-[#FFF2D6] px-3 py-1 font-semibold text-[#8A5A00]"><Clock size={16} aria-hidden />{copy.deadline(settings.reviewHours)}</p>}
            <p>{copy.confirm}</p>
          </>}
        </div>
        <div aria-label={copy.progress(step + 1)} role="img" className="mb-2 flex justify-center gap-2">
          {copy.tourTitles.map((title, index) => <span key={title} className={`size-2 rounded-full ${index === step ? "bg-[#0A47B1]" : "bg-[#D6E6F7]"}`} />)}
        </div>
        <div className="flex justify-between gap-2">
          <button type="button" className={`${secondary} disabled:opacity-40`} disabled={step === 0} onClick={() => goTo(step - 1)}>{copy.back}</button>
          {step === 3 ? <Dialog.Close className={primary}>{copy.setup}</Dialog.Close>
            : <button type="button" className={primary} onClick={() => goTo(step + 1)}>{copy.next}</button>}
        </div>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}
