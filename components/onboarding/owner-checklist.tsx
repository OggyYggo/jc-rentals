"use client";

import Link from "next/link";
import { Check, Circle, CircleCheck, Clock } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { markOwnerOnboarding } from "@/lib/onboarding/actions";
import { onboardingCopy } from "@/lib/onboarding/content";
import type { readOwnerOnboarding } from "@/lib/onboarding/owner";
import { readStorage, writeStorage } from "@/lib/onboarding/storage";
import { OwnerTour } from "./owner-tour";
import { idleSubscribe, LanguageToggle, primary, secondary, surface, useOnboardingLanguage, useUnobstructedPage } from "./shared";

const links = [null, "/owner/payment-settings", "/owner/cars?new=1", "/owner/credits/top-up", "/owner/help?guide=deposit"];

export function OwnerChecklistSkeleton() {
  return <div role="status" aria-label={onboardingCopy.en.loading} className={`${surface} mb-4 space-y-3`}>
    <div aria-hidden className="h-5 w-40 rounded bg-[#EAF4FF] motion-safe:animate-pulse" />
    <div aria-hidden className="h-2 rounded bg-[#EAF4FF] motion-safe:animate-pulse" />
    {[0, 1, 2, 3, 4].map(row => <div key={row} aria-hidden className="h-10 rounded-lg bg-[#F3F9FF] motion-safe:animate-pulse" />)}
  </div>;
}

export function OwnerChecklist({ data }: { data: NonNullable<Awaited<ReturnType<typeof readOwnerOnboarding>>> }) {
  const language = useOnboardingLanguage();
  const title = useId();
  const copy = onboardingCopy[language];
  const unobstructed = useUnobstructedPage();
  const [hidden, setHidden] = useState(false);
  const [guideRead, setGuideRead] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const tourStarted = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const dashboardFocus = useRef<HTMLSpanElement>(null);
  const sessionKey = data.sessionId ? `kuyog-owner-setup:${data.sessionId}` : null;
  const dismissedKey = `kuyog-owner-setup-dismissed:${data.ownerId}`;
  const tourKey = `kuyog-owner-tour:${data.ownerId}`;
  const sessionHidden = useSyncExternalStore(idleSubscribe, () => Boolean(sessionKey && readStorage(sessionKey, true)), () => false);
  const dismissedHere = useSyncExternalStore(idleSubscribe, () => Boolean(readStorage(dismissedKey, true)), () => false);

  useEffect(() => {
    if (!data.tour || dismissedHere || !unobstructed || tourStarted.current || readStorage(tourKey, true)) return;
    const frame = requestAnimationFrame(() => {
      tourStarted.current = true;
      returnFocus.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
        ? document.activeElement : dashboardFocus.current;
      setTourOpen(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [data.tour, dismissedHere, tourKey, unobstructed]);

  function closeTour() {
    setTourOpen(false);
    writeStorage(tourKey, "1", true);
    void markOwnerOnboarding("tour_seen").catch(() => {});
    requestAnimationFrame(() => returnFocus.current?.focus());
  }

  function finishTour() {
    if (guideRead || data.guide) return;
    setGuideRead(true);
    void markOwnerOnboarding("guide_confirm_deposit").catch(() => {});
  }

  function dismiss(complete: boolean) {
    setHidden(true);
    if (complete) {
      writeStorage(dismissedKey, "1", true);
      void markOwnerOnboarding("dismissed").catch(() => {});
    } else if (sessionKey) writeStorage(sessionKey, "1", true);
  }

  const states = [data.currentOwner, data.qr === null ? null : data.qr === "done", data.vehicle, data.credits, guideRead || data.guide];
  const count = states.filter(Boolean).length;
  const current = states.findIndex((state, index) => state === false && !(index === 1 && data.qr === "review"));
  const complete = count === 5 && data.canList && data.completionEnabled;

  return <>
    <span ref={dashboardFocus} tabIndex={-1} className="sr-only">{copy.title}</span>
    {!hidden && !sessionHidden && !dismissedHere && <section aria-labelledby={title} lang={language} className={`${surface} mb-4`}>
      {complete ? <div className="flex flex-wrap items-center gap-3">
        <CircleCheck size={36} className="shrink-0 text-[#12703A]" aria-hidden />
        <h2 id={title} className="min-w-0 flex-1 font-heading text-lg font-bold">{copy.ready}</h2>
        <div className="flex flex-wrap gap-1">
          <Link href="/owner/cars" className={primary} onClick={() => dismiss(true)}>{copy.vehicles}</Link>
          <button type="button" className={secondary} onClick={() => dismiss(true)}>{copy.dismiss}</button>
        </div>
      </div> : <>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id={title} className="font-heading text-xl font-bold">{copy.title}</h2>
            <p className="mt-1 text-[#5B6F89]">{copy.intro}</p>
          </div>
          <span className="rounded-full bg-[#EAF4FF] px-3 py-1 font-semibold text-[#0A3D91]">{copy.count(count)}</span>
        </div>
        <div role="progressbar" aria-labelledby={title} aria-valuemin={0} aria-valuemax={5} aria-valuenow={count} aria-valuetext={copy.count(count)}
          className="my-4 grid grid-cols-5 gap-1.5">
          {states.map((_, index) => <span key={index} className={`h-2 rounded-full ${index < count ? "bg-[#0A47B1]" : "bg-[#E3EEF9]"}`} />)}
        </div>
        <ol className="space-y-1">
          {states.map((done, index) => {
            const review = index === 1 && data.qr === "review";
            const Icon = done ? Check : review ? Clock : Circle;
            const href = links[index];
            const active = current === index;
            return <li key={index} className={`flex min-h-12 items-center gap-2 rounded-xl px-2 py-1 sm:gap-3 sm:px-3 ${active ? "bg-[#EAF4FF]" : ""}`}>
              <span className={`grid size-7 shrink-0 place-items-center rounded-full ${done ? "bg-[#E3F7EA] text-[#12703A]" : review ? "bg-[#FFF2D6] text-[#8A5A00]" : "text-[#5B6F89]"}`}><Icon size={16} aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <p className={`font-semibold ${done ? "text-[#5B6F89] line-through" : ""}`}>{copy.rows[index]}{done && <span className="sr-only"> · {copy.done}</span>}</p>
                {review && <p className="text-[#8A5A00]">{copy.review}</p>}
              </div>
              {!done && !review && href && <Link href={href} className={active ? primary : secondary} aria-label={`${active ? copy.start : copy.open} · ${copy.rows[index]}`}>
                {active ? copy.start : copy.open}
              </Link>}
            </li>;
          })}
        </ol>
        {count === 5 && !data.canList && <p className="mt-3 rounded-lg bg-[#FFF2D6] p-3 text-[#8A5A00]">{copy.unavailable}</p>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <LanguageToggle language={language} />
          <button type="button" className={secondary} onClick={() => dismiss(false)}>{copy.hide}</button>
        </div>
      </>}
    </section>}
    {tourOpen && <OwnerTour settings={data} onClose={closeTour} onFinish={finishTour} />}
  </>;
}
