"use client";

import Script from "next/script";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

export type TurnstileBoxHandle = { reset: () => void };

type TurnstileBoxProps = {
  id: string;
  onTokenChange: (token: string) => void;
  disabled?: boolean;
};

export const TurnstileBox = forwardRef<TurnstileBoxHandle, TurnstileBoxProps>(function TurnstileBox(
  { id, onTokenChange, disabled = false },
  ref,
) {
  const element = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const onTokenChangeRef = useRef(onTokenChange);
  onTokenChangeRef.current = onTokenChange;

  const reset = useCallback(() => {
    if (window.turnstile && widgetId.current) window.turnstile.reset(widgetId.current);
    onTokenChangeRef.current("");
  }, []);

  useImperativeHandle(ref, () => ({ reset }), [reset]);

  const mount = useCallback(() => {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!siteKey || !window.turnstile || !element.current || widgetId.current) return;
    widgetId.current = window.turnstile.render(element.current, {
      sitekey: siteKey,
      theme: "light",
      callback: (token: string) => onTokenChangeRef.current(token),
      "expired-callback": () => onTokenChangeRef.current(""),
      "error-callback": () => onTokenChangeRef.current(""),
    });
  }, []);

  useEffect(() => () => {
    widgetId.current = undefined;
  }, []);

  return (
    <div id={id} tabIndex={-1} aria-label="Cloudflare Turnstile verification" aria-disabled={disabled} className={`flex min-h-[66px] items-center rounded-xl border border-[#D6E6F7] bg-white p-2 outline-none focus-visible:ring-[3px] focus-visible:ring-[#2E9BF0] ${disabled ? "pointer-events-none opacity-60" : ""}`}>
      {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onLoad={mount} onReady={mount} />
          <div ref={element} />
        </>
      ) : <p className="px-2 text-xs text-[#C62828]">Security check is not configured.</p>}
    </div>
  );
});
