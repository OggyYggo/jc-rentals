"use client";

import { REASON_MAX, REASON_MIN, reasonError } from "./reason";
import { alertTheme, loadSwal, openDialog } from "./swal";

export type Confirmation = {
  title: string;
  text?: string;
  confirmText: string;
  cancelText?: string;
  danger?: boolean;
};

export async function confirmAction({ title, text, confirmText, cancelText = "Cancel", danger = false }: Confirmation) {
  const Swal = await loadSwal();
  const theme = alertTheme();
  const result = await openDialog(Swal, {
    ...theme,
    customClass: { ...theme.customClass, popup: danger ? "dashboard-alert dashboard-alert-danger" : "dashboard-alert" },
    titleText: title,
    text,
    icon: danger ? "warning" : "question",
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    focusCancel: danger,
    focusConfirm: !danger,
  }).result;
  return result.isConfirmed;
}

export function confirmDanger(options: Omit<Confirmation, "danger">) {
  return confirmAction({ ...options, danger: true });
}

export type ReasonPrompt = {
  title: string;
  text?: string;
  label: string;
  placeholder?: string;
  confirmText: string;
  minLength?: number;
  maxLength?: number;
  required?: boolean;
};

export async function promptReason({
  title, text, label, placeholder, confirmText, minLength = REASON_MIN, maxLength = REASON_MAX, required = true,
}: ReasonPrompt): Promise<string | null> {
  const Swal = await loadSwal();
  const { isConfirmed, value } = await openDialog<string>(Swal, {
    ...alertTheme(),
    titleText: title,
    text,
    showCancelButton: true,
    cancelButtonText: "Cancel",
    confirmButtonText: confirmText,
    input: "textarea",
    inputLabel: label,
    inputPlaceholder: placeholder,
    inputAttributes: { maxlength: String(maxLength) },
    inputValidator: (value) => reasonError(value, minLength, maxLength, required),
  }).result;
  return isConfirmed ? (value ?? "").trim() : null;
}
