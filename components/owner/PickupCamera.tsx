"use client";

import { useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";

export default function PickupCamera({ onScan }: { onScan: (value: string) => boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const handler = useRef(onScan);
  useEffect(() => { handler.current = onScan; }, [onScan]);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return;
    let stopped = false;
    const scanner = new QrScanner(element, ({ data }) => {
      if (!stopped && handler.current(data)) scanner.stop();
    }, { preferredCamera: "environment", maxScansPerSecond: 8, returnDetailedScanResult: true });
    void scanner.start().then(() => {
      if (stopped) scanner.destroy();
    }).catch(() => {
      if (!stopped) setError("Camera unavailable. Allow camera access in your browser settings or enter the backup code.");
    });
    return () => { stopped = true; scanner.destroy(); };
  }, []);
  return <div className="overflow-hidden rounded-2xl bg-[#0b2040] p-3 text-white">
    <div className="relative aspect-square overflow-hidden rounded-xl bg-slate-950">
      <video ref={video} muted playsInline className="h-full w-full object-cover" aria-label="Pickup pass camera preview"/>
      <div aria-hidden className="pointer-events-none absolute inset-[15%] rounded-3xl border-2 border-blue-400" />
    </div>
    <p className="px-2 py-3 text-center text-sm">Place the QR inside the blue frame.</p>
    {error && <p role="status" className="p-2 text-sm">{error}</p>}
  </div>;
}
