"use client";

import { confirmAction, promptReason, type Confirmation, type ReasonPrompt } from "./confirm";
import { friendlyError } from "./errors";
import { alertTheme, loadSwal, openDialog } from "./swal";
import { toastError, toastInfo, toastSuccess } from "./toast";

type AlertAction<T> = {
  confirm?: Confirmation;
  reason?: ReasonPrompt;
  run: (reason: string) => Promise<T>;
  success?: string | ((result: T) => string);
  successType?: "success" | "info";
  errorType?: "dialog" | "toast";
  refresh?: () => void;
  setPending?: (pending: boolean) => void;
};

let actionInProgress = false;

async function showError(error: unknown) {
  const { title, text, action } = friendlyError(error);
  const Swal = await loadSwal();
  const result = await openDialog(Swal, {
    ...alertTheme(),
    icon: "error",
    titleText: title,
    text,
    confirmButtonText: action?.label ?? "Close",
    showCancelButton: Boolean(action),
    cancelButtonText: "Close",
  }).result;
  if (action && result.isConfirmed) window.location.assign(action.href);
}

export async function runWithAlerts<T>(opts: AlertAction<T>): Promise<{ ok: true; data: T } | { ok: false }> {
  if (actionInProgress) return { ok: false };
  actionInProgress = true;
  const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let waiting = false;
  let closeLoading: (() => Promise<void>) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function stopLoading() {
    waiting = false;
    clearTimeout(timer);
    const close = closeLoading;
    closeLoading = undefined;
    if (close) await close();
  }
  try {
    const reason = opts.reason ? await promptReason(opts.reason) : "";
    if (reason === null || (opts.confirm && !(await confirmAction(opts.confirm)))) return { ok: false };
    opts.setPending?.(true);
    waiting = true;
    timer = setTimeout(() => {
      void loadSwal().then((Swal) => {
        if (!waiting) return;
        const theme = alertTheme();
        const loading = openDialog(Swal, {
          ...theme,
          customClass: { ...theme.customClass, popup: "dashboard-alert dashboard-alert-loading" },
          titleText: "Please wait…",
          showConfirmButton: false,
          allowOutsideClick: false,
          allowEscapeKey: false,
          didOpen: (popup) => {
            if (waiting && Swal.getPopup() === popup) Swal.showLoading();
          },
        });
        closeLoading = loading.close;
      }).catch(() => {});
    }, 600);
    const data = await opts.run(reason);
    await stopLoading();
    opts.refresh?.();
    if (opts.success) {
      const message = typeof opts.success === "function" ? opts.success(data) : opts.success;
      await (opts.successType === "info" ? toastInfo(message) : toastSuccess(message));
    }
    return { ok: true, data };
  } catch (error) {
    await stopLoading();
    try {
      if (opts.errorType === "toast") await toastError(error);
      else await showError(error);
    } catch {
      // The original action result still applies if the alert chunk is unavailable.
    }
    return { ok: false };
  } finally {
    opts.setPending?.(false);
    actionInProgress = false;
    if (trigger) requestAnimationFrame(() => {
      if (document.activeElement === document.body && trigger.isConnected) trigger.focus({ preventScroll: true });
    });
  }
}
