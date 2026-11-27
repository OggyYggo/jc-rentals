"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { showConnectionDialog } from "@/lib/alerts/connection";
import { slowConnectionToast } from "@/lib/alerts/toast";
import { connectionError, fetchWithTimeout, isOffline } from "@/lib/connection/request";
import { useConnectionStatus } from "@/lib/connection/provider";
import { paymentPeso } from "@/lib/payment-format";

const methods = { gcash: "GCash", maya: "Maya", gotyme: "GoTyme", other: "Other (QR Ph or bank)" };
const amounts = [500, 1000, 2000];
let checkoutInFlight = false;
const checkoutAttempts = new Map<string, string>();

function checkoutAttempt(slot: string) {
  let key = checkoutAttempts.get(slot);
  try { key ??= sessionStorage.getItem(slot) ?? undefined; } catch { /* Storage can be disabled. */ }
  key ??= crypto.randomUUID();
  checkoutAttempts.set(slot, key);
  try { sessionStorage.setItem(slot, key); } catch { /* The in-memory key still works. */ }
  return key;
}

function clearCheckoutAttempt(slot: string) {
  checkoutAttempts.delete(slot);
  try { sessionStorage.removeItem(slot); } catch { /* Storage can be disabled. */ }
}

export function useOnlineTopupRefresh(orderId: string, status: string) {
  const router = useRouter();
  const waiting = status === "created";
  useEffect(() => {
    if (!waiting) return;
    const deadline = Date.now() + 120_000;
    const interval = window.setInterval(() => {
      if (Date.now() > deadline) window.clearInterval(interval);
      else if (!isOffline()) router.refresh();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [orderId, router, waiting]);
}

export async function openOnlineTopup(amount: number, method: keyof typeof methods, onUncertain: () => void) {
  if (checkoutInFlight) return "A payment is already opening. Please wait.";
  checkoutInFlight = true;
  const time = new Date();
  const slot = `kuyog:quickpay-attempt:${amount}:${method}`;
  const slow = setTimeout(() => void slowConnectionToast(), 8000);
  try {
    const response = await fetchWithTimeout("/api/payments/topup/create", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": checkoutAttempt(slot) },
      body: JSON.stringify({ amount, channel: method === "other" ? undefined : method }),
    }, { payment: true });
    const result = await response.json();
    if (!response.ok || typeof result.url !== "string") {
      if (result.code === "attempt_closed" || result.code === "attempt_rejected") clearCheckoutAttempt(slot);
      return result.error || onlineTopupError;
    }
    window.location.assign(result.url);
    clearCheckoutAttempt(slot);
    return "";
  } catch (error) {
    clearTimeout(slow);
    const issue = connectionError(error);
    if (issue && !issue.sent) return "Needs internet to continue.";
    onUncertain();
    await showConnectionDialog({ time, amount, statusHref: "/owner/credits?check=payment" }, false);
    return "Check your credits before starting another payment.";
  } finally {
    clearTimeout(slow);
    checkoutInFlight = false;
  }
}

export const onlineTopupError = "Could not open online payment. Please try again.";

export function OnlineTopupStatus({ orderId, status, mobile }: { orderId: string; status: string; mobile?: ReactNode }) {
  useOnlineTopupRefresh(orderId, status);
  const waiting = status === "created";

  return <>{mobile}<section className="mb-4 hidden rounded-xl border bg-white p-4 lg:block" role="status">
    <h2 className="font-semibold">{waiting ? "Waiting for confirmation" : status === "paid" ? "Credits added" : "Not completed"}</h2>
    <p className="mt-1 text-sm text-slate-600">{orderId}</p>
  </section></>;
}

export function OnlineTopup({ minimum, maximum }: { minimum: number; maximum: number }) {
  const [preset, setPreset] = useState<number | "custom">(minimum <= 500 && 500 <= maximum ? 500 : "custom");
  const [method, setMethod] = useState<keyof typeof methods>("other");
  const offline = useConnectionStatus() === "offline";
  const [uncertain, setUncertain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || uncertain || offline) return;
    const amount = preset === "custom" ? Number(new FormData(event.currentTarget).get("amount")) : preset;
    setBusy(true);
    setError("");
    try {
      const message = await openOnlineTopup(amount, method, () => setUncertain(true));
      if (message) {
        setError(message);
        setBusy(false);
      }
    } catch {
      setError(onlineTopupError);
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
      {uncertain && <a href="/owner/credits?check=payment" className="inline-flex min-h-11 items-center underline">Check credits</a>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button disabled={busy || uncertain || offline} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-60">
        {busy && <LoaderCircle size={16} className="motion-safe:animate-spin" aria-hidden />}
        {busy ? "Opening payment…" : offline ? "Needs internet to continue" : "Continue to payment"}
      </button>
    </form>
    <p className="mt-3 text-sm text-slate-600">Credits are added after the payment is confirmed. Usually a few minutes.</p>
    <a href="#manual-top-up" className="mt-2 inline-block text-sm font-medium text-blue-800 underline">
      Pay by QR and upload proof instead
    </a>
  </section>;
}
