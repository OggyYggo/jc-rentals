"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import { PickupCheck } from "@/components/pickup/PickupCheck";
import { pickupScanToken, requestPickupLookup } from "@/lib/pickup/client";
import { pickupCodePattern, type PickupCredential, type PickupLookup } from "@/lib/pickup/model";

const Camera = dynamic(() => import("./PickupCamera"), { ssr: false, loading: () => <p role="status">Opening camera…</p> });

export function PickupScanner({ origins }: { origins: string[] }) {
  const [camera, setCamera] = useState(false);
  const [backup, setBackup] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ lookup: PickupLookup; credential: PickupCredential }>();
  const active = useRef(false);
  const prevScan = useRef({ value: "", time: 0 });

  async function lookup(credential: PickupCredential) {
    if (active.current) return;
    active.current = true;
    setCamera(false);
    setBusy(true);
    setError("");
    try {
      const lookup = await requestPickupLookup(credential);
      setResult({ lookup, credential });
    } catch {
      setError("Could not check the pass. Check your connection and try again.");
    } finally {
      active.current = false;
      setBusy(false);
    }
  }

  function scan(value: string) {
    if (active.current || (prevScan.current.value === value && Date.now() - prevScan.current.time < 2000)) return false;
    prevScan.current = { value, time: Date.now() };
    const token = pickupScanToken(value, origins);
    if (!token) {
      setError("This is not a Kuyog Bohol pickup pass.");
      return false;
    }
    navigator.vibrate?.(70);
    void lookup({ token });
    return true;
  }

  if (result) return <PickupCheck {...result} onCancel={() => {
    setResult(undefined); setCode(""); prevScan.current = { value: "", time: 0 };
  }} />;

  return <div className="space-y-3">
    {camera ? <Camera onScan={scan}/> : <button type="button" disabled={busy} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0A3D91] px-3 text-sm font-semibold text-white disabled:opacity-50" onClick={() => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError("Camera access needs a secure connection and a supported browser. Use the backup code.");
        setBackup(true);
      } else { setError(""); setCamera(true); }
    }}><ScanLine size={18} aria-hidden /> Open camera</button>}
    <button type="button" disabled={busy} aria-expanded={backup} onClick={() => { setBackup(!backup); setCamera(false); }}
      className="min-h-11 text-sm font-semibold text-blue-800 underline">Enter 6-digit code instead</button>
    {backup && <form className="space-y-2 rounded-xl border bg-white p-4" onSubmit={event => {
      event.preventDefault();
      if (pickupCodePattern.test(code)) void lookup({ code });
    }}>
      <label className="block text-sm font-semibold">Pickup backup code
        <span className="relative mt-2 block w-fit">
          <input type="text" autoComplete="off" inputMode="numeric" value={code} disabled={busy}
            className="peer absolute inset-0 z-10 w-full cursor-text rounded-lg text-transparent caret-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            style={{ background: "transparent" }} onChange={event => {
              const next = event.target.value.replace(/[^0-9]/g, "").slice(0,6);
              setCode(next);
              if (pickupCodePattern.test(next)) void lookup({ code: next });
            }} />
          <span className="flex gap-1.5" aria-hidden>{Array.from({ length: 6 }, (_, index) =>
            <span key={index} className="grid h-11 w-8 place-items-center rounded-md border bg-slate-50 text-lg tabular-nums sm:w-10">{code[index]}</span>)}</span>
        </span>
      </label>
      <p className="text-xs text-slate-600">Type or paste all six digits.</p>
      <button type="submit" disabled={busy || !pickupCodePattern.test(code)} className="min-h-11 rounded-lg border px-3 text-sm font-semibold disabled:opacity-50">Check code</button>
    </form>}
    {busy && <p role="status" className="text-sm">Checking pickup pass…</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-950">{error}</p>}
  </div>;
}
