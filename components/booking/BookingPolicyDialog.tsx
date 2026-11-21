"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Dialog, DialogPanel } from "@/components/ui/dialog";
import { SubmitButton } from "@/components/loading/SubmitButton";
import { CANCELLATION_POLICY_VERSION, cancellationPolicy } from "@/lib/policies/cancellation";

export function BookingPolicyDialog({ label, disabled, className, summary }: {
  label: string; disabled: boolean; className: string; summary: string;
}) {
  const accepted = useRef<HTMLInputElement>(null);
  const version = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const submitted = useRef(false);
  const { pending } = useFormStatus();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (pending || !submitted.current || !sending) return;
    // The action committed and stayed on the listing, so allow corrections.
    const frame = requestAnimationFrame(() => {
      submitted.current = false;
      if (accepted.current) accepted.current.value = "";
      if (version.current) version.current.value = "";
      setSending(false);
      setOpen(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [pending, sending]);

  return <>
    <input ref={accepted} type="hidden" name="policy_accepted" />
    <input ref={version} type="hidden" name="policy_version" />
    <Dialog.Root open={open} onOpenChange={next => {
      if (pending || submitted.current) return;
      if (!next || trigger.current?.form?.reportValidity()) setOpen(next);
    }}>
      <Dialog.Trigger ref={trigger} render={<SubmitButton unstyled type="button" disabled={disabled}
        busy={sending} pendingText="Sending request…" className={className} />}>{label}</Dialog.Trigger>
      <DialogPanel>
        <Dialog.Title className="text-lg font-semibold">{cancellationPolicy.title}</Dialog.Title>
        <Dialog.Description className="mt-2 text-sm">{summary}</Dialog.Description>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">{cancellationPolicy.points.map(point => <li key={point}>{point}</li>)}</ul>
        <a href={cancellationPolicy.termsHref} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-9 items-center text-sm font-semibold text-blue-800 underline">Read full terms</a>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Dialog.Close disabled={sending || pending} className="min-h-11 rounded-lg border px-3 text-sm">Cancel</Dialog.Close>
          <SubmitButton unstyled type="button" busy={sending} pendingText="Sending request…"
            className="min-h-11 rounded-lg bg-blue-700 px-3 text-sm font-semibold text-white disabled:opacity-70" onClick={() => {
              const form = accepted.current?.form;
              if (submitted.current || !form?.reportValidity() || !accepted.current || !version.current) return;
              submitted.current = true;
              accepted.current.value = "1";
              version.current.value = CANCELLATION_POLICY_VERSION;
              setSending(true);
              form.requestSubmit();
            }}>Accept and request booking</SubmitButton>
        </div>
      </DialogPanel>
    </Dialog.Root>
  </>;
}
