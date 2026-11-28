"use client";

import { ChevronDown, CirclePlay } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { markOwnerOnboarding } from "@/lib/onboarding/actions";
import { creditSteps, onboardingCopy } from "@/lib/onboarding/content";
import { OwnerTour, type TourSettings } from "./owner-tour";
import { focus, LanguageToggle, secondary, surface, useOnboardingLanguage } from "./shared";

export function OwnerHelp({ settings, rate, email, openDeposit }: {
  settings: TourSettings;
  rate: number;
  email: string;
  openDeposit: boolean;
}) {
  const language = useOnboardingLanguage();
  const copy = onboardingCopy[language];
  const [replay, setReplay] = useState(false);
  const seen = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);

  function recordDepositGuide() {
    if (seen.current) return;
    seen.current = true;
    void markOwnerOnboarding("guide_confirm_deposit").catch(() => {});
  }

  useEffect(() => {
    if (openDeposit) recordDepositGuide();
  }, [openDeposit]);

  return <div lang={language} className="mx-auto max-w-3xl space-y-4 font-body text-sm text-[#0F2342]">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="font-heading text-2xl font-bold">{copy.help}</h1>
        <p className="mt-1 text-[#5B6F89]">{copy.helpIntro}</p>
      </div>
      <LanguageToggle language={language} />
    </header>
    <div className={`${surface} divide-y divide-[#E3EEF9] !py-1`}>
      {copy.guides.map((guide, index) => <details key={index} name="owner-guides" className="group"
        open={index === 1 && openDeposit ? true : undefined}
        onToggle={event => { if (index === 1 && event.currentTarget.open) recordDepositGuide(); }}>
        <summary className={`flex min-h-14 cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 py-2 [&::-webkit-details-marker]:hidden ${focus}`}>
          <span className="min-w-0 flex-1 font-semibold">{guide.title}</span>
          {index === 1 && <span className="rounded-full bg-[#FFF2D6] px-2 py-1 text-[13px] font-semibold text-[#8A5A00]">{copy.important}</span>}
          {index !== 5 && <span className="text-[13px] text-[#5B6F89]">{copy.minute(index < 3 ? 1 : 2)}</span>}
          <ChevronDown size={17} className="shrink-0 text-[#0A47B1] group-open:rotate-180" aria-hidden />
        </summary>
        <ol className="list-decimal space-y-2 pb-4 pl-5 text-[#5B6F89]">
          {(index === 3 ? creditSteps(language, settings.minimum, rate) : guide.steps).map(step => <li key={step}>{step}</li>)}
        </ol>
        {index === 5 && <a href={`mailto:${email}`} className={`${secondary} max-w-full break-all`}>{email}</a>}
      </details>)}
    </div>
    <button type="button" ref={trigger} className={`${secondary} w-full gap-2 border border-[#D6E6F7] bg-white`} onClick={() => setReplay(true)}>
      <CirclePlay size={18} aria-hidden />{copy.replay}
    </button>
    {replay && <OwnerTour settings={settings} onFinish={recordDepositGuide} onClose={() => {
      setReplay(false);
      void markOwnerOnboarding("tour_seen").catch(() => {});
      requestAnimationFrame(() => trigger.current?.focus());
    }} />}
  </div>;
}
