"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, CircleHelp, Hash, LoaderCircle, ScanLine, VideoOff } from "lucide-react";
import { PickupCheck } from "@/components/pickup/PickupCheck";
import { pickupScanToken, requestPickupLookup } from "@/lib/pickup/client";
import { pickupCodePattern, type PickupCredential, type PickupLookup } from "@/lib/pickup/model";

const Camera = dynamic(() => import("./PickupCamera"), { ssr: false, loading: () => <p role="status">Opening camera…</p> });

export function PickupScanner({ origins }: { origins: string[] }) {
  const [camera, setCamera] = useState<MediaStream | null>(null);
  const [requestingCamera, setRequestingCamera] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [reloadNeeded, setReloadNeeded] = useState(false);
  const cameraStream = useRef<MediaStream | null>(null);
  const cameraRequest = useRef(0);

  const [backup, setBackup] = useState(false);
  const codeInput = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ lookup: PickupLookup; credential: PickupCredential }>();
  const active = useRef(false);
  const prevScan = useRef({ value: "", time: 0 });

  useEffect(() => () => {
    cameraRequest.current++;
    cameraStream.current?.getTracks().forEach(track => track.stop());
  }, []);

  useEffect(() => {
    if (backup && window.matchMedia("(max-width: 1023px)").matches) codeInput.current?.focus({ preventScroll: true });
  }, [backup]);

  function closeCamera() {
    cameraRequest.current++;
    cameraStream.current?.getTracks().forEach(track => track.stop());
    cameraStream.current = null;
    setCamera(null);
    setRequestingCamera(false);
  }

  async function openCamera() {
    setCameraError("");
    setReloadNeeded(false);
    setError("");
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("This browser can’t open the camera here. Open the scanner in Safari or Chrome using the secure site address.");
      return;
    }
    type CameraPolicy = { allowsFeature: (feature: string) => boolean };
    const page = document as Document & { permissionsPolicy?: CameraPolicy; featurePolicy?: CameraPolicy };
    if ((page.permissionsPolicy ?? page.featurePolicy)?.allowsFeature("camera") === false) {
      setCameraError("Camera access is blocked on this page. Reload the scanner to try again.");
      setReloadNeeded(true);
      return;
    }
    const request = ++cameraRequest.current;
    setRequestingCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      if (request !== cameraRequest.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      cameraStream.current = stream;
      setBackup(false);
      setCamera(stream);
    } catch (error) {
      if (request !== cameraRequest.current) return;
      const name = error instanceof DOMException ? error.name : "";
      setCameraError(name === "NotAllowedError" || name === "SecurityError"
        ? "Camera access was blocked. Allow it in your browser, then tap Open camera again."
        : name === "NotFoundError" ? "No camera was found. You can enter the six-digit backup code."
        : "The camera couldn’t start. Close other apps using it, then try again.");
    } finally {
      if (request === cameraRequest.current) setRequestingCamera(false);
    }
  }

  async function lookup(credential: PickupCredential) {
    if (active.current) return;
    active.current = true;
    closeCamera();
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

  return <div className="flex flex-col gap-3" data-owner-camera={camera ? "" : undefined}>
    {camera ? <>
      <Camera stream={camera} onScan={scan} onError={() => {
        closeCamera();
        setCameraError("The camera opened but the preview couldn’t start. Try again or use the backup code.");
      }} />
      <button type="button" onClick={closeCamera} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#d9e5f4] bg-white px-3 text-sm font-semibold text-blue-800 lg:self-start lg:rounded-lg lg:bg-transparent">
        <VideoOff size={17} aria-hidden="true" className="lg:hidden" />Close camera
      </button>
    </> : <div className={backup ? "hidden lg:block" : undefined}>
      <div aria-hidden="true" className="grid justify-items-center rounded-t-2xl bg-[#0b2345] px-4 py-5 text-white lg:hidden">
        <span className="grid size-[72px] place-items-center rounded-2xl border border-blue-400/35 bg-[#163861] text-[#8dc4ff]"><ScanLine size={40} strokeWidth={1.5} /></span>
        <p className="mt-2.5 text-sm font-medium text-blue-100">Align the QR code inside the frame</p>
      </div>
      <div className="rounded-b-2xl border border-t-0 border-[#dae6f5] bg-white p-3 lg:border-0 lg:bg-transparent lg:p-0">
        <button type="button" disabled={busy || requestingCamera} onClick={() => void openCamera()}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0A3D91] px-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:opacity-70">
          {requestingCamera ? <LoaderCircle size={18} aria-hidden="true" className="motion-safe:animate-spin" /> : <ScanLine size={18} aria-hidden="true" />}
          {requestingCamera ? "Waiting for camera permission…" : "Open camera"}
        </button>
      </div>
    </div>}
    {cameraError && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">{cameraError}</p>}
    {reloadNeeded && <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-lg border px-3 text-sm font-semibold text-blue-800 lg:self-start">Reload scanner</button>}
    {!camera && <details className="group order-last rounded-xl border border-[#dae6f5] bg-white px-3 text-sm text-slate-700 lg:order-none lg:rounded-lg">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-2 font-semibold text-blue-900 [&::-webkit-details-marker]:hidden lg:list-item lg:py-3">
        <CircleHelp size={16} aria-hidden="true" className="shrink-0 lg:hidden" />
        <span className="flex-1">How to allow camera access</span>
        <ChevronDown size={16} aria-hidden="true" className="shrink-0 group-open:rotate-180 lg:hidden" />
      </summary>
      <div className="space-y-2 pb-3 leading-5">
        <p><strong>iPhone Safari</strong> · Open the page menu in the address bar and look for Website Settings. If it’s missing, go to Settings → Apps → Safari → Camera and select Ask.</p>
        <p><strong>Android Chrome</strong> · Open Site controls next to the address, select Permissions, and allow Camera. You can also check Chrome Settings → Site settings → Camera.</p>
        <p>If you opened the scanner inside another app, open it in Safari or Chrome. Then return here and tap Open camera.</p>
      </div>
    </details>}
    <button type="button" disabled={busy} aria-expanded={backup} aria-controls={backup ? "pickup-backup-form" : undefined} onClick={() => { setBackup(!backup); closeCamera(); }}
      className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#d9e5f4] bg-white px-3 text-sm font-semibold text-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:opacity-60 lg:min-h-11 lg:self-start lg:rounded-none lg:border-0 lg:bg-transparent lg:px-0 lg:underline">
      <Hash size={17} aria-hidden="true" className="lg:hidden" />
      <span className="lg:hidden">{backup ? "Back to camera" : "Enter 6-digit code instead"}</span><span className="hidden lg:inline">Enter 6-digit code instead</span>
    </button>
    {backup && <form id="pickup-backup-form" className="space-y-3 rounded-2xl border border-[#dae6f5] bg-white p-4 lg:space-y-2 lg:rounded-xl" onSubmit={event => {
      event.preventDefault();
      if (pickupCodePattern.test(code)) void lookup({ code });
    }}>
      <label className="block text-sm font-semibold text-[#163052]">Pickup backup code
        <span className="relative mt-3 block max-w-[280px] lg:mt-2 lg:w-fit">
          <input ref={codeInput} type="text" autoComplete="off" inputMode="numeric" value={code} disabled={busy} aria-describedby="pickup-code-hint"
            className="absolute inset-0 z-10 w-full cursor-text rounded-lg bg-transparent text-base text-transparent caret-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700" onChange={event => {
              const next = event.target.value.replace(/[^0-9]/g, "").slice(0,6);
              setCode(next);
              if (pickupCodePattern.test(next)) void lookup({ code: next });
            }} />
          <span className="grid grid-cols-6 gap-1.5 lg:flex" aria-hidden="true">{Array.from({ length: 6 }, (_, index) =>
            <span key={index} className={`grid h-11 min-w-0 place-items-center rounded-lg border text-lg font-semibold tabular-nums text-[#163052] lg:w-10 ${index === code.length ? "border-blue-400 bg-blue-50" : "border-[#dae6f5] bg-slate-50"}`}>{code[index]}</span>)}</span>
        </span>
      </label>
      <p id="pickup-code-hint" className="text-xs text-slate-600">Type or paste the six digits on the customer’s pass.</p>
      <button type="submit" disabled={busy || !pickupCodePattern.test(code)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#0A3D91] px-3 text-sm font-semibold text-white disabled:opacity-50 lg:w-auto lg:border lg:bg-white lg:text-[#163052]">
        {busy && <LoaderCircle size={16} aria-hidden="true" className="motion-safe:animate-spin" />}Check code
      </button>
    </form>}
    {busy && <p role="status" className="rounded-lg bg-blue-50 p-3 text-sm font-medium text-blue-950 lg:bg-transparent lg:p-0">Checking pickup pass…</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-950">{error}</p>}
  </div>;
}
