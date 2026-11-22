"use client";

import { useEffect, useRef } from "react";
import QrScanner from "qr-scanner";

export default function PickupCamera({ stream, onScan, onError }: {
  stream: MediaStream; onScan: (value: string) => boolean; onError: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const handlers = useRef({ onScan, onError });
  useEffect(() => { handlers.current = { onScan, onError }; }, [onScan, onError]);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let stopped = false;
    let timer: number | undefined;
    const canvas = document.createElement("canvas");
    const engine = QrScanner.createQrEngine();
    element.srcObject = stream;

    async function scan() {
      if (stopped || !element) return;
      if (!document.hidden && element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        try {
          const side = Math.round(Math.min(element.videoWidth, element.videoHeight) * 0.8);
          const result = await QrScanner.scanImage(element, {
            qrEngine: engine, canvas, returnDetailedScanResult: true,
            scanRegion: {
              x: Math.round((element.videoWidth - side) / 2),
              y: Math.round((element.videoHeight - side) / 2),
              width: side, height: side, downScaledWidth: 400, downScaledHeight: 400,
            },
          });
          if (!stopped && handlers.current.onScan(result.data)) return;
        } catch (error) {
          if (stopped) return;
          if (error !== QrScanner.NO_QR_CODE_FOUND && error !== `Scanner error: ${QrScanner.NO_QR_CODE_FOUND}`) {
            handlers.current.onError();
            return;
          }
        }
      }
      if (!stopped) timer = window.setTimeout(() => void scan(), 125);
    }

    Promise.all([element.play(), engine]).then(() => {
      if (!stopped) void scan();
    }).catch(() => {
      if (!stopped) handlers.current.onError();
    });

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      element.pause();
      element.srcObject = null;
      void engine.then(decoder => { if (decoder instanceof Worker) decoder.terminate(); }, () => {});
    };
  }, [stream]);

  return <div className="overflow-hidden rounded-2xl bg-[#0b2040] p-2 text-white lg:p-3">
    <div className="relative aspect-square overflow-hidden rounded-xl bg-slate-950">
      <video ref={video} muted playsInline className="h-full w-full object-cover" aria-label="Pickup pass camera preview"/>
      <div aria-hidden="true" className="pointer-events-none absolute inset-[15%] lg:rounded-3xl lg:border-2 lg:border-blue-400">
        <span className="absolute left-0 top-0 size-8 rounded-tl-xl border-l-4 border-t-4 border-blue-300 lg:hidden" />
        <span className="absolute right-0 top-0 size-8 rounded-tr-xl border-r-4 border-t-4 border-blue-300 lg:hidden" />
        <span className="absolute bottom-0 left-0 size-8 rounded-bl-xl border-b-4 border-l-4 border-blue-300 lg:hidden" />
        <span className="absolute bottom-0 right-0 size-8 rounded-br-xl border-b-4 border-r-4 border-blue-300 lg:hidden" />
      </div>
    </div>
    <p className="px-2 py-3 text-center text-sm">Place the QR inside the blue frame.</p>
  </div>;
}
