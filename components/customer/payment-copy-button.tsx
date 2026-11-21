"use client";

import { useState } from "react";

export function PaymentCopyButton({ value, label }: { value: string; label: string }) {
  const [message, setMessage] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Copied");
    } catch {
      setMessage("Copy unavailable");
    }
  }
  return <button type="button" onClick={copy} className="min-h-11 rounded-lg border bg-white px-3 text-sm font-semibold text-blue-800">
    {label}<span aria-live="polite">{message && ` · ${message}`}</span>
  </button>;
}
