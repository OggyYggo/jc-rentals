"use client";

import { useSyncExternalStore } from "react";
import { languages, onboardingCopy, type Language } from "@/lib/onboarding/content";
import { readStorage, writeStorage } from "@/lib/onboarding/storage";

export const focus = "rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A47B1]";
export const button = `inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center px-3 text-sm font-semibold ${focus}`;
export const primary = `${button} bg-[#0A47B1] text-white hover:bg-[#0A3D91]`;
export const secondary = `${button} text-[#0A47B1] hover:bg-[#EAF4FF]`;
export const surface = "rounded-2xl border border-[#D6E6F7] bg-white p-4 font-body text-sm text-[#0F2342] sm:p-5";
export const idleSubscribe = () => () => {};

let selectedLanguage: Language | undefined;
const languageKey = "kuyog-onboarding-language";
const languageEvent = "kuyog-onboarding-language-change";
function subscribeLanguage(notify: () => void) {
  window.addEventListener(languageEvent, notify);
  return () => window.removeEventListener(languageEvent, notify);
}

export function useOnboardingLanguage(): Language {
  return useSyncExternalStore(subscribeLanguage, () =>
    selectedLanguage ?? (readStorage(languageKey) === "ceb" ? "ceb" : "en"), () => "en");
}

export function LanguageToggle({ language }: { language: Language }) {
  return <div role="group" aria-label={onboardingCopy[language].language} className="inline-flex w-fit rounded-xl border border-[#D6E6F7] bg-white p-0.5">
    {(Object.keys(languages) as Language[]).map(value => <button key={value} type="button" aria-pressed={value === language}
      className={`${secondary} aria-pressed:bg-[#EAF4FF]`} onClick={() => {
        selectedLanguage = value;
        writeStorage(languageKey, value);
        window.dispatchEvent(new Event(languageEvent));
      }}>{languages[value]}</button>)}
  </div>;
}

const modalSelector = 'dialog[open], [role="dialog"][data-open], [role="dialog"][aria-modal="true"]:not([data-closed]), .swal2-container';
function subscribeOverlay(notify: () => void) {
  const observer = new MutationObserver(notify);
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["open", "data-open", "data-closed", "aria-modal"] });
  document.addEventListener("visibilitychange", notify);
  return () => { observer.disconnect(); document.removeEventListener("visibilitychange", notify); };
}

export function useUnobstructedPage() {
  return useSyncExternalStore(subscribeOverlay, () => !document.hidden && !document.querySelector(modalSelector), () => false);
}
