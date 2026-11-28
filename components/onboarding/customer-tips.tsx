"use client";

import { CalendarDays, QrCode, WalletCards, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { onboardingCopy } from "@/lib/onboarding/content";
import { readStorage, writeStorage } from "@/lib/onboarding/storage";
import { LanguageToggle, secondary, surface, useOnboardingLanguage, useUnobstructedPage } from "./shared";

const disabledKey = "kuyog-customer-tips-disabled";
const homeKey = "kuyog-customer-booking-steps-dismissed";
const changeEvent = "kuyog-customer-tips-change";

function subscribeTips(notify: () => void) {
  window.addEventListener(changeEvent, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(changeEvent, notify);
    window.removeEventListener("storage", notify);
  };
}

let disabledHere = false;
function tipsDisabled() {
  return disabledHere || Boolean(readStorage(disabledKey));
}

export function CustomerBookingSteps() {
  const language = useOnboardingLanguage();
  const copy = onboardingCopy[language];
  const unobstructed = useUnobstructedPage();
  const [dismissed, setDismissed] = useState(false);
  const visible = useSyncExternalStore(subscribeTips, () => !tipsDisabled() && !readStorage(homeKey), () => false);
  if (!unobstructed || !visible || dismissed) return null;

  return <section lang={language} aria-label={copy.customerTitle} className="mx-auto w-full max-w-6xl px-5 pt-5 sm:px-8">
    <div className={`${surface} bg-[#F3F9FF]`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-bold">{copy.customerTitle}</h2>
        <div className="flex items-center gap-1">
          <LanguageToggle language={language} />
          <button type="button" aria-label={copy.dismiss} className={secondary} onClick={() => {
            setDismissed(true);
            writeStorage(homeKey, "1");
          }}><X size={19} aria-hidden /></button>
        </div>
      </div>
      <ol className="mt-3 grid gap-2 sm:grid-cols-3">
        {[CalendarDays, WalletCards, QrCode].map((Icon, index) => <li key={index} className="flex min-w-0 items-center gap-2 font-semibold">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#EAF4FF] text-[#0A47B1]"><Icon size={18} aria-hidden /></span>
          {copy.customerSteps[index]}
        </li>)}
      </ol>
    </div>
  </section>;
}

export function CustomerQrTip({ kind, eligible = true }: { kind: "payment" | "pickup"; eligible?: boolean }) {
  const language = useOnboardingLanguage();
  const copy = onboardingCopy[language];
  const unobstructed = useUnobstructedPage();
  const disabled = useSyncExternalStore(subscribeTips, tipsDisabled, () => true);
  const [showing, setShowing] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const key = `kuyog-customer-${kind}-tip-seen`;

  useEffect(() => {
    if (!eligible || !unobstructed || disabled || readStorage(key)) return;
    const frame = requestAnimationFrame(() => {
      setShowing(true);
      writeStorage(key, "1");
    });
    return () => cancelAnimationFrame(frame);
  }, [disabled, eligible, key, unobstructed]);

  if (!eligible || !unobstructed || disabled || !showing || dismissed) return null;
  return <aside lang={language} className="relative mt-3 rounded-xl bg-[#0A3D91] px-3 pt-3 text-sm text-white print:hidden">
    <span aria-hidden className="absolute -top-1.5 left-6 size-3 rotate-45 bg-[#0A3D91]" />
    <p><strong>{kind === "payment" ? copy.payTitle : copy.passTitle}</strong> {kind === "payment" ? copy.payTip : copy.passTip}</p>
    <div className="flex flex-wrap gap-x-1">
      <button type="button" className={`${secondary} !text-white hover:!bg-white/15 focus-visible:!outline-white`} onClick={() => setDismissed(true)}>{copy.gotIt}</button>
      {kind === "payment" && <button type="button" className={`${secondary} !text-white hover:!bg-white/15 focus-visible:!outline-white`} onClick={() => {
        if (writeStorage(disabledKey, "1")) disabledHere = true;
        setDismissed(true);
        window.dispatchEvent(new Event(changeEvent));
      }}>{copy.disable}</button>}
    </div>
  </aside>;
}
