"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function CopyButton({ value, label = "Copy", copiedLabel = "Copied", mobileTouch = false }: {
  value: string; label?: string; copiedLabel?: string; mobileTouch?: boolean;
}) {
  const [result, setResult] = useState<"copied" | "failed" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    let copied = false;
    try {
      await navigator.clipboard.writeText(value);
      copied = true;
    } catch {
      const previous = document.activeElement;
      const field = document.createElement("textarea");
      field.value = value;
      field.readOnly = true;
      field.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px";
      try {
        (previous?.closest('[role="dialog"]') ?? document.body).append(field);
        field.select();
        field.setSelectionRange(0, value.length);
        copied = document.execCommand("copy");
      } catch {
        copied = false;
      } finally {
        field.remove();
        if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
      }
    }
    setResult(copied ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setResult(null), 2000);
  }

  return <span className="inline-flex flex-wrap items-center gap-1">
    <button type="button" onClick={copy} aria-label={label} className={`inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg border bg-white px-2 text-xs font-semibold text-blue-800 focus-visible:ring-2 focus-visible:ring-blue-600 ${mobileTouch ? "max-md:min-h-11" : ""}`}>
      {result === "copied" ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}{label}
    </button>
    <span aria-live="polite" className="text-xs">{result === "copied" ? copiedLabel : result === "failed" ? "Select the text to copy it." : ""}</span>
  </span>;
}
