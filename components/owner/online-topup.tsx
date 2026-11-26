"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { paymentPeso } from "@/lib/payment-format";

const methods = { GCASH: "GCash", MAYA: "Maya", GOTYME: "GoTyme" };
const amounts = [500, 1000, 2000];

export function OnlineTopupStatus({ orderId, status }: { orderId: string; status: string }) {
  const router = useRouter();
  const waiting = status === "created";
  useEffect(() => {
    if (!waiting) return;
    const deadline = Date.now() + 120_000;
    const interval = window.setInterval(() => {
      if (Date.now() <= deadline) router.refresh();
      else window.clearInterval(interval);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [orderId, router, waiting]);

  return <section className="mb-4 rounded-xl border bg-white p-4" role="status">
    <h2 className="font-semibold">{waiting ? "Waiting for confirmation" : status === "paid" ? "Credits added" : "Not completed"}</h2>
    <p className="mt-1 text-sm text-slate-600">{orderId}</p>
  </section>;
}

export function OnlineTopup({ minimum, maximum }: { minimum: number; maximum: number }) {
  const [preset, setPreset] = useState<number | "custom">(500 <= maximum ? 500 : "custom");
  const [method, setMethod] = useState<keyof typeof methods>("GCASH");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const amount = preset === "custom" ? Number(new FormData(event.currentTarget).get("amount")) : preset;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/payments/bayadgate/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, method }),
      });
      const result = await response.json();
      if (!response.ok || typeof result.paymentUrl !== "string") {
        setError(result.error || "Could not open online payment. Please try again.");
        setBusy(false);
        return;
      }
      window.location.assign(result.paymentUrl);
    } catch {
      setError("Could not open online payment. Please try again.");
      setBusy(false);
    }
  }

  const chip = (selected: boolean) => `min-h-11 rounded-lg border px-3 text-sm font-medium disabled:opacity-50 ${selected
    ? "border-blue-700 bg-blue-50 text-blue-800"
    : "border-slate-300 bg-white text-slate-700"}`;

  return <section className="mt-5 rounded-xl border border-slate-200 p-4">
    <h2 className="font-semibold">Pay online</h2>
    <form onSubmit={submit} className="mt-3 space-y-3">
      <fieldset disabled={busy}>
        <legend className="mb-2 text-sm font-medium text-slate-700">Amount</legend>
        <div className="flex flex-wrap gap-2">
          {amounts.map(amount => <button key={amount} type="button" disabled={amount < minimum || amount > maximum}
            aria-pressed={preset === amount} className={chip(preset === amount)} onClick={() => setPreset(amount)}>
            {paymentPeso(amount).replace(/\.00$/, "")}
          </button>)}
          <button type="button" className={chip(preset === "custom")} aria-pressed={preset === "custom"}
            onClick={() => setPreset("custom")}>Custom</button>
        </div>
        {preset === "custom" && <label className="mt-3 block text-sm">
          Custom amount in pesos
          <input name="amount" type="number" inputMode="numeric" min={minimum} max={maximum} step="1" required
            className="mt-1 block min-h-11 w-full rounded-lg border p-2" />
        </label>}
      </fieldset>
      <fieldset disabled={busy}>
        <legend className="mb-2 text-sm font-medium text-slate-700">Payment method</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(methods) as (keyof typeof methods)[]).map(value =>
            <button key={value} type="button" className={chip(method === value)} aria-pressed={method === value}
              onClick={() => setMethod(value)}>{methods[value]}</button>)}
        </div>
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-60">
        {busy && <LoaderCircle size={16} className="motion-safe:animate-spin" aria-hidden />}
        {busy ? "Opening payment…" : "Continue to payment"}
      </button>
    </form>
    <p className="mt-3 text-sm text-slate-600">Credits are added after the payment is confirmed. Usually a few minutes.</p>
    <a href="#manual-top-up" className="mt-2 inline-block text-sm font-medium text-blue-800 underline">
      Pay by QR and upload proof instead
    </a>
  </section>;
}
