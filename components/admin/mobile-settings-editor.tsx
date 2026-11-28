"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { ResponsiveSheet } from "@/components/ui/responsive-sheet";
import { reasonError, REASON_MAX } from "@/lib/alerts/reason";
import { mobileAction, mobilePrimaryAction } from "./ui";

export type SettingValue = string | boolean | File | null;
export type SettingValues = Record<string, SettingValue>;
export type SettingField = {
  key: string;
  label: string;
  type: "number" | "text" | "textarea" | "switch" | "file";
  description?: string;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;
};
export type SettingChange = { label: string; before: string; after: string };

const inputClass = "min-h-11 min-w-0 w-full rounded-lg border border-[#D6E6F7] bg-white px-3 py-2 text-sm text-[#0F2342] focus-visible:outline-2 focus-visible:outline-[#0A47B1]";
const discardMessage = "Discard your unsaved changes?";

export function useUnsavedSettings(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const startingLocation = location.href;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const linkClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") as HTMLAnchorElement | null : null;
      if (!link || link.target || link.hasAttribute("download")) return;
      if (link.pathname === location.pathname && link.search === location.search) return;
      if (!window.confirm(discardMessage)) { event.preventDefault(); event.stopPropagation(); }
    };
    const leave = (event: PopStateEvent) => {
      if (location.href === startingLocation || window.confirm(discardMessage)) return;
      event.stopImmediatePropagation();
      window.history.forward();
    };
    window.addEventListener("beforeunload", unload);
    window.addEventListener("popstate", leave, true);
    document.addEventListener("click", linkClick, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("popstate", leave, true);
      document.removeEventListener("click", linkClick, true);
    };
  }, [dirty]);
}

export function SettingsSaveBar({ count, busy, discard, form, onReview, disabled }: {
  count: number; busy: boolean; discard: () => void; form?: string; onReview?: () => void; disabled?: boolean;
}) {
  if (!count) return null;
  return <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 mt-4 flex flex-wrap justify-between gap-2 rounded-xl border border-[#D6E6F7] bg-white p-2 shadow-lg lg:bottom-4">
    <button type="button" className={mobileAction} disabled={busy} onClick={discard}>Discard</button>
    <button type={form ? "submit" : "button"} form={form} onClick={onReview} disabled={busy || disabled} className={mobilePrimaryAction}>
      {busy ? "Saving…" : `Save ${count} ${count === 1 ? "change" : "changes"}`}
    </button>
  </div>;
}

export function SettingsReview({ changes, explain, needsReason, close, save }: {
  changes: SettingChange[]; explain?: string; needsReason?: boolean;
  close: () => void; save: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const error = reasonError(reason);
  return <Dialog.Root open onOpenChange={open => { if (!open) close(); }}>
    <ResponsiveSheet desktopFrom="lg">
      <Dialog.Title className="font-heading text-xl font-bold">Confirm changes</Dialog.Title>
      <Dialog.Description className="mt-2 text-[#5B6F89]">Review the values before saving them to the audit log.</Dialog.Description>
      <ul className="mt-4 divide-y divide-[#D6E6F7] rounded-xl bg-[#F3F9FF] px-3">
        {changes.map(change => <li key={change.label} className="break-words py-2">
          <strong>{change.label}</strong>
          <p className="whitespace-pre-wrap text-[#5B6F89]">{change.before} → {change.after}</p>
        </li>)}
      </ul>
      {explain && <p className="mt-3 text-[#5B6F89]">{explain}</p>}
      {needsReason && <label className="mt-4 block font-semibold">Audit reason
        <textarea className={`${inputClass} mt-1`} rows={2} maxLength={REASON_MAX} value={reason} onChange={event => setReason(event.target.value)} />
        <span className="text-[13px] font-normal text-[#5B6F89]">Use 3 to 300 characters. Keep ID numbers and bank details out of this note.</span>
      </label>}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Dialog.Close className={mobileAction}>Cancel</Dialog.Close>
        <button type="button" className={mobilePrimaryAction} disabled={needsReason && Boolean(error)} onClick={() => save(reason.trim())}>Save changes</button>
      </div>
    </ResponsiveSheet>
  </Dialog.Root>;
}

function displayValue(value: SettingValue, field: SettingField) {
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (value instanceof File) return value.name;
  return value ? [value, field.unit].filter(Boolean).join(" ") : "(empty)";
}

function fieldChanged(field: SettingField, before: SettingValue, after: SettingValue) {
  return field.type === "number" && before !== "" && after !== ""
    ? Number(before) !== Number(after) : before !== after;
}

export function MobileSettingsEditor({ fields, initial, onSave, busy, explanation, needsReason, children }: {
  fields: SettingField[]; initial: SettingValues; onSave: (values: SettingValues, reason: string) => Promise<boolean>;
  busy: boolean; explanation?: string; needsReason?: boolean; children?: (values: SettingValues) => ReactNode;
}) {
  const form = useId();
  const [baseline, setBaseline] = useState(initial);
  const [values, setValues] = useState(initial);
  const [confirm, setConfirm] = useState(false);
  const [fileReset, resetFile] = useState(0);
  const changed = fields.filter(field => fieldChanged(field, baseline[field.key], values[field.key]));
  const changes = changed.map(field => ({ label: field.label, before: displayValue(baseline[field.key], field), after: displayValue(values[field.key], field) }));
  useUnsavedSettings(changes.length > 0);
  function discard() { setValues(baseline); resetFile(value => value + 1); }
  async function save(reason: string) {
    setConfirm(false);
    if (!(await onSave(values, reason))) return;
    const saved = { ...values };
    for (const field of fields) if (field.type === "file") saved[field.key] = null;
    setBaseline(saved);
    setValues(saved);
    resetFile(value => value + 1);
  }
  return <>
    <form id={form} className="space-y-3" onSubmit={event => { event.preventDefault(); if (changes.length) setConfirm(true); }}>
      <fieldset disabled={busy} className="space-y-3">
        {fields.map(field => <SettingInput key={field.type === "file" ? `${field.key}-${fileReset}` : field.key} field={field}
          value={values[field.key]} changed={changed.includes(field)} onChange={value => setValues(current => ({ ...current, [field.key]: value }))} />)}
      </fieldset>
      {children?.(values)}
    </form>
    <SettingsSaveBar count={changes.length} busy={busy} discard={discard} form={form} />
    {confirm && <SettingsReview changes={changes} needsReason={needsReason} explain={explanation} close={() => setConfirm(false)} save={reason => void save(reason)} />}
  </>;
}

function SettingInput({ field, value, changed, onChange }: {
  field: SettingField; value: SettingValue; changed: boolean; onChange: (value: SettingValue) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  function step(up: boolean) {
    const control = input.current;
    if (!control) return;
    if (up) control.stepUp();
    else control.stepDown();
    onChange(control.value);
  }
  return <div className={`space-y-2 rounded-xl border border-[#D6E6F7] p-3 text-sm ${changed ? "bg-[#EAF4FF]" : "bg-white"}`}>
    <label htmlFor={id} className="block font-semibold">{field.label}</label>
    {field.description && <p id={`${id}-help`} className="text-[13px] text-[#5B6F89]">{field.description}</p>}
    {field.type === "number" ? <div className="flex flex-wrap items-center gap-2">
      <button type="button" aria-label={`Decrease ${field.label}`} className={`${mobileAction} size-11 px-0`} onClick={() => step(false)}><Minus size={16} aria-hidden /></button>
      <input id={id} ref={input} className={`${inputClass} flex-1 basis-12`} type="number" inputMode="decimal" min={field.min} max={field.max}
        step={field.step} required={field.required} value={String(value ?? "")} onChange={event => onChange(event.target.value)}
        aria-describedby={field.description ? `${id}-help` : undefined} />
      <button type="button" aria-label={`Increase ${field.label}`} className={`${mobileAction} size-11 px-0`} onClick={() => step(true)}><Plus size={16} aria-hidden /></button>
      {field.unit && <span className="text-[13px] text-[#5B6F89]">{field.unit}</span>}
    </div> : field.type === "textarea" ? <textarea id={id} className={inputClass} rows={5} value={String(value ?? "")} onChange={event => onChange(event.target.value)} />
      : field.type === "switch" ? <button id={id} type="button" role="switch" aria-checked={Boolean(value)} aria-label={field.label}
        className={mobileAction} onClick={() => onChange(!value)}>{value ? "On" : "Off"}</button>
        : field.type === "file" ? <input id={id} type="file" accept="image/*" className={inputClass} onChange={event => onChange(event.target.files?.[0] ?? null)} />
          : <input id={id} className={inputClass} value={String(value ?? "")} onChange={event => onChange(event.target.value)} />}
  </div>;
}
