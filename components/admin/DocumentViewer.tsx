"use client";

import { useEffect, useState } from "react";
import { fetchWithTimeout, connectionError } from "@/lib/connection/request";
import { showConnectionDialog } from "@/lib/alerts/connection";
import { slowConnectionToast } from "@/lib/alerts/toast";
import { ErrorState } from "@/components/loading/ErrorState";
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
  const [revision, setRevision] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [turns, setTurns] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    async function read(signal = controller.signal) {
      const previewSource = `${source}${source.includes("?") ? "&" : "?"}preview=1`;
      const response = await fetchWithTimeout(previewSource, { cache: "no-store", signal });
      if (!response.ok) {
        await response.body?.cancel();
        return { error: response.status === 404 ? "This document is missing." : "This document couldn’t be opened. Try again." };
      }
      if (response.headers.get("content-type") === "application/pdf") {
        await response.body?.cancel();
        return { url: source, pdf: true };
      }
      const document = await response.blob();
      controller.signal.throwIfAborted();
      objectUrl = URL.createObjectURL(document);
      return { url: objectUrl, pdf: false };
    }
    async function load() {
      const activeRead = new AbortController();
      const pending = new AbortController();
      let restart = false;
      const slow = setTimeout(() => void slowConnectionToast(() => {
        restart = true;
        activeRead.abort();
      }, pending.signal), 8000);
      try {
        const result = await read(AbortSignal.any([controller.signal, activeRead.signal])).catch(error => {
          if (restart && !controller.signal.aborted) return read();
          throw error;
        });
        if (!controller.signal.aborted) setPreview(result);
      } catch (error) {
        pending.abort();
        if (controller.signal.aborted) return;
        const issue = connectionError(error);
        if (issue && issue.kind !== "offline") {
          const result = await showConnectionDialog({ time: new Date(), retry: read }, true);
          if (controller.signal.aborted) return;
          if (result.recovered) { setPreview(result.data); return; }
        }
        setPreview({ error: "This document couldn’t be opened." });
      } finally { clearTimeout(slow); pending.abort(); }
    }
    void load();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source, revision]);

  if (!preview) return <p role="status" className="flex items-center gap-2 p-4 text-sm"><Spinner className="size-4" /> Loading document…</p>;
  if ("error" in preview) return <ErrorState message={preview.error} variant="connection" onRetry={() => {
    setPreview(undefined);
    setRevision(value => value + 1);
  }} />;

  const control = "inline-flex min-h-9 items-center rounded-lg border px-2 text-sm font-medium text-blue-900 focus-visible:ring-2 focus-visible:ring-blue-600";
  return <section aria-label={label} className="space-y-3">
    <div className="flex flex-wrap gap-2">
      {!preview.pdf && <>
        <button type="button" className={control} onClick={() => setZoom(value => !value)}>{zoom ? "Fit image" : "Zoom to 100%"}</button>
        <button type="button" className={control} onClick={() => setTurns(value => (value + 1) % 4)}>Rotate</button>
      </>}
      {!preview.pdf && <a href={source} target="_blank" rel="noreferrer" className={control}>Open in new tab</a>}
      <a href={`${source}${source.includes("?") ? "&" : "?"}download=1`} className={control}>Download</a>
    </div>
    {preview.pdf ? <p className="text-sm text-slate-600">Download the PDF to review it.</p>
      : <div className="max-h-[55dvh] overflow-auto rounded-lg border bg-slate-100 p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview.url} alt={label} className={zoom ? "mx-auto max-w-none" : "mx-auto max-h-[48dvh] max-w-full object-contain"}
          style={{ rotate: `${turns * 90}deg`, ...(turns % 2 && !zoom ? { maxHeight: "min(100%, 65vw, 22rem)", maxWidth: "min(100%, 40dvh)" } : {}) }} />
      </div>}
  </section>;
}
