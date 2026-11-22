"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/loading/Spinner";

export type DocumentKind = "license" | "id" | "selfie";

export const documentLabels = { license: "Driver’s license", id: "Government ID", selfie: "Selfie with ID" };

type Preview = { url: string; pdf: boolean } | { error: string };

export function DocumentViewer({ customerId, kind, revision }: { customerId: string; kind: DocumentKind; revision?: string }) {
  const source = `/api/admin/customer-documents/${customerId}/${kind}${revision ? `?revision=${encodeURIComponent(revision)}` : ""}`;
  return <DocumentPreview key={source} source={source} label={documentLabels[kind]} />;
}

function DocumentPreview({ source, label }: { source: string; label: string }) {
  const [preview, setPreview] = useState<Preview>();
  const [zoom, setZoom] = useState(false);
  const [turns, setTurns] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    async function load() {
      try {
        const response = await fetch(source, { cache: "no-store", signal: controller.signal });
        if (!response.ok) {
          if (!controller.signal.aborted) setPreview({ error: response.status === 404 ? "This document is missing." : "This document couldn’t be opened. Try again." });
          return;
        }
        const document = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(document);
        setPreview({ url: objectUrl, pdf: document.type === "application/pdf" });
      } catch {
        if (!controller.signal.aborted) setPreview({ error: "This document couldn’t be opened. Check your connection." });
      }
    }
    void load();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source]);

  if (!preview) return <p role="status" className="flex items-center gap-2 p-4 text-sm"><Spinner className="size-4" /> Loading document…</p>;
  if ("error" in preview) return <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{preview.error}</p>;

  const control = "inline-flex min-h-9 items-center rounded-lg border px-2 text-sm font-medium text-blue-900 focus-visible:ring-2 focus-visible:ring-blue-600";
  return <section aria-label={label} className="space-y-3">
    <div className="flex flex-wrap gap-2">
      {!preview.pdf && <>
        <button type="button" className={control} onClick={() => setZoom(value => !value)}>{zoom ? "Fit image" : "Zoom to 100%"}</button>
        <button type="button" className={control} onClick={() => setTurns(value => (value + 1) % 4)}>Rotate</button>
      </>}
      <a href={source} target="_blank" rel="noreferrer" className={control}>Open in new tab</a>
      <a href={`${source}${source.includes("?") ? "&" : "?"}download=1`} className={control}>Download</a>
    </div>
    {preview.pdf ? <iframe title={`${label} PDF`} src={preview.url} className="h-[min(55dvh,34rem)] w-full rounded-lg border" />
      : <div className="max-h-[55dvh] overflow-auto rounded-lg border bg-slate-100 p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview.url} alt={label} className={zoom ? "mx-auto max-w-none" : "mx-auto max-h-[48dvh] max-w-full object-contain"}
          style={{ rotate: `${turns * 90}deg`, ...(turns % 2 && !zoom ? { maxHeight: "min(100%, 65vw, 22rem)", maxWidth: "min(100%, 40dvh)" } : {}) }} />
      </div>}
  </section>;
}
