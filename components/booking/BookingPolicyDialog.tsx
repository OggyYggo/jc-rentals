"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarCheck, ShieldAlert, Wallet } from "lucide-react";
import { useBookingPending } from "./BookingRequestForm";
import { Dialog, DialogPanel } from "@/components/ui/dialog";
import { isOffline } from "@/lib/connection/request";
import { SubmitButton } from "@/components/loading/SubmitButton";
import { CANCELLATION_POLICY_VERSION, cancellationPolicy } from "@/lib/policies/cancellation";

export function BookingPolicyDialog({ label, disabled, className, summary, policyText, hours }: {
  label: string; disabled: boolean; className: string; summary: string; policyText: string; hours: number;
}) {
  const accepted = useRef<HTMLInputElement>(null);
  const version = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const submitted = useRef(false);
  const pending = useBookingPending();
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);
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

  function requestBooking() {
    const form = accepted.current?.form;
    if (isOffline() || submitted.current || !form?.reportValidity() || !accepted.current || !version.current) return;
    submitted.current = true;
    accepted.current.value = "1";
    version.current.value = CANCELLATION_POLICY_VERSION;
    setSending(true);
    form.requestSubmit();
  }

  return <>
    <input ref={accepted} type="hidden" name="policy_accepted" />
    <input ref={version} type="hidden" name="policy_version" />
    <Dialog.Root open={open} onOpenChange={next => {
      if (pending || submitted.current) return;
      if (!next || trigger.current?.form?.reportValidity()) {
        setChecked(false);
        setOpen(next);
      }
    }}>
      <Dialog.Trigger ref={trigger} render={<SubmitButton unstyled type="button" disabled={disabled}
        busy={sending} pendingText="Sending request…" className={className} />}><span className="md:hidden">Request this car</span><span className="hidden md:inline">{label}</span></Dialog.Trigger>
      <DialogPanel className="max-md:inset-x-0 max-md:top-auto max-md:bottom-0 max-md:w-full max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <Dialog.Title className="text-lg font-semibold max-md:font-heading max-md:text-xl max-md:font-bold max-md:text-[#0F2342]"><span className="md:hidden">Cancellation policy</span><span className="hidden md:inline">{cancellationPolicy.title}</span></Dialog.Title>
        <Dialog.Description className="mt-2 text-sm max-md:text-[#5B6F89]"><span className="md:hidden">{policyText || "Review the cancellation terms before sending your request."}</span><span className="hidden md:inline">{summary}</span></Dialog.Description>
        <div className="md:hidden">
          <ul className="my-4 space-y-3 rounded-2xl bg-[#F3F9FF] p-4 text-sm text-[#0F2342]">
            <li className="flex gap-2"><CalendarCheck className="size-5 shrink-0 text-[#0A47B1]" aria-hidden />Cancel for free at least {hours} hours before pickup.</li>
            <li className="flex gap-2"><Wallet className="size-5 shrink-0 text-[#0A47B1]" aria-hidden />{summary}</li>
            <li className="flex gap-2"><ShieldAlert className="size-5 shrink-0 text-[#0A47B1]" aria-hidden />Repeated cancellations or no-shows may affect your booking access.</li>
          </ul>
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input type="checkbox" className="size-5 shrink-0 accent-[#0A47B1]" checked={checked} onChange={event => setChecked(event.target.checked)} />I have read and accept the cancellation policy.</label>
          <SubmitButton unstyled type="button" disabled={!checked} busy={sending} pendingText="Sending request…" onClick={requestBooking} className="mt-3 h-[52px] w-full rounded-full bg-[#0A47B1] text-sm font-semibold text-white disabled:opacity-50">Accept and continue</SubmitButton>
          <Dialog.Close className="mt-1 min-h-11 w-full text-sm font-semibold text-[#0A3D91]" disabled={sending || pending}>Back</Dialog.Close>
        </div>
        <div className="hidden md:block">
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">{cancellationPolicy.points.map(point => <li key={point}>{point}</li>)}</ul>
        <a href={cancellationPolicy.termsHref} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-9 items-center text-sm font-semibold text-blue-800 underline">Read full terms</a>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Dialog.Close disabled={sending || pending} className="min-h-11 rounded-lg border px-3 text-sm">Cancel</Dialog.Close>
          <SubmitButton unstyled type="button" busy={sending} pendingText="Sending request…"
            className="min-h-11 rounded-lg bg-blue-700 px-3 text-sm font-semibold text-white disabled:opacity-70" onClick={requestBooking}>Accept and request booking</SubmitButton>
        </div>
        </div>
      </DialogPanel>
    </Dialog.Root>
  </>;
}
