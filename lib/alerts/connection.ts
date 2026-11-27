"use client";

import { paymentPeso } from "@/lib/payment-format";
import { connectionError, isOffline } from "@/lib/connection/request";
import { alertTheme, loadSwal, openDialog } from "./swal";

export type CheckOutcome<T> = { state: "found"; data: T } | { state: "not-found" | "unknown" };
export type ConnectionAttempt<T> = {
  reference?: string;
  amount?: number;
  time: Date;
  checkStatus?: () => Promise<CheckOutcome<T>>;
  retry?: () => Promise<T>;
  statusHref?: string;
};

export async function showConnectionDialog<T>(attempt: ConnectionAttempt<T>, safe: boolean): Promise<{ recovered: true; data: T } | { recovered: false }> {
  const Swal = await loadSwal();
  const theme = alertTheme();
  const details = document.createElement("div");
  const copy = document.createElement("p");
  copy.textContent = safe
    ? "Your connection seems slow. Nothing was changed. You can try again."
    : attempt.amount !== undefined
      ? "We're not sure your request went through. Please check before trying again so you aren't charged twice."
      : "We're not sure your request went through. Please check its status before trying again.";
  details.append(copy);
  if (!safe) {
    const reference = document.createElement("p");
    reference.className = "connection-reference";
    reference.textContent = [
      attempt.reference && `Reference ${attempt.reference}`,
      attempt.amount !== undefined && paymentPeso(attempt.amount),
      new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }).format(attempt.time),
    ].filter(Boolean).join(" · ");
    details.append(reference);
  }
  const notice = document.createElement("p");
  notice.className = "connection-dialog-notice";
  notice.setAttribute("role", "status");
  details.append(notice);

  let recovered: { recovered: true; data: T } | { recovered: false } = { recovered: false };
  let retryAllowed = false;
  let working = false;
  let retryButton: HTMLButtonElement | undefined;
  let popup: HTMLElement | undefined;

  async function retry() {
    if (!attempt.retry || working) return;
    working = true;
    notice.textContent = "Trying again…";
    if (!safe) {
      retryAllowed = false;
      if (retryButton) retryButton.disabled = true;
    }
    try {
      const data = await attempt.retry();
      if (Swal.getPopup() !== popup) return;
      recovered = { recovered: true, data };
      Swal.close({ isConfirmed: true });
    } catch (error) {
      notice.textContent = safe
        ? "Still not working. Check your connection and try again."
        : connectionError(error) ? "Still checking. Try again in a moment." : "Check the current status before trying again.";
    } finally { working = false; }
  }

  async function checkStatus() {
    if (working) return;
    if (isOffline()) {
      notice.textContent = "Reconnect to check the status.";
      return;
    }
    if (!attempt.checkStatus) {
      if (attempt.statusHref) window.location.assign(attempt.statusHref);
      else notice.textContent = "Close this message and check the current status before trying again.";
      return;
    }
    working = true;
    notice.textContent = "Checking status…";
    try {
      const result = await attempt.checkStatus();
      if (Swal.getPopup() !== popup) return;
      if (result.state === "found") {
        recovered = { recovered: true, data: result.data };
        Swal.close({ isConfirmed: true });
        return;
      }
      retryAllowed = result.state === "not-found" && Boolean(attempt.retry);
      if (retryButton) retryButton.disabled = !retryAllowed;
      notice.textContent = retryAllowed ? "We couldn't find your request. You can try again." : "Still checking. Try again in a moment.";
    } catch {
      retryAllowed = false;
      if (retryButton) retryButton.disabled = true;
      notice.textContent = "Still checking. Try again in a moment.";
    } finally { working = false; }
  }

  await openDialog(Swal, {
    ...theme,
    customClass: { ...theme.customClass, popup: "dashboard-alert connection-dialog" },
    icon: "warning",
    titleText: safe ? "This is taking too long" : "We couldn't confirm this",
    html: details,
    showCancelButton: true,
    cancelButtonText: "Close",
    confirmButtonText: safe ? "Try again" : "Check status",
    allowOutsideClick: false,
    allowEscapeKey: true,
    willOpen(element) {
      popup = element;
      if (safe) return;
      retryButton = document.createElement("button");
      retryButton.type = "button";
      retryButton.className = "dashboard-alert-button dashboard-alert-cancel";
      retryButton.textContent = "Try again (after checking)";
      retryButton.disabled = true;
      retryButton.onclick = () => { if (retryAllowed) void retry(); };
      const actions = Swal.getActions();
      actions?.append(retryButton);
    },
    preConfirm() {
      if (safe) void retry();
      else void checkStatus();
      return false;
    },
  }).result;
  return recovered;
}
