"use client";

import { confirmAction, promptReason, type Confirmation, type ReasonPrompt } from "./confirm";
import { ConnectionError, connectionError, isOffline, withConnectionDeadline } from "@/lib/connection/request";
import { showConnectionDialog, type ConnectionAttempt } from "./connection";
import { friendlyError } from "./errors";
import { alertTheme, loadSwal, openDialog } from "./swal";
import { slowConnectionToast, toastError, toastInfo, toastSuccess } from "./toast";

type AlertAction<T> = {
  connection?: Omit<ConnectionAttempt<T>, "time" | "retry"> & { idempotent?: boolean; statusRetry?: boolean; showLoading?: boolean; timeoutMs?: number };
  confirm?: Confirmation;
  reason?: ReasonPrompt;
  prepare?: () => Promise<string | null>;
  run: (reason: string, signal?: AbortSignal) => Promise<T>;
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
  let slowTimer: ReturnType<typeof setTimeout> | undefined;
  let closeLoading: (() => Promise<void>) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let loadingClosed: Promise<void> | undefined;
  let showLoading = true;
  function hideLoading() {
    showLoading = false;
    clearTimeout(timer);
    if (closeLoading) {
      loadingClosed = closeLoading();
      closeLoading = undefined;
    }
    return loadingClosed;
  }
  async function stopLoading() {
    waiting = false;
    clearTimeout(slowTimer);
    await hideLoading();
  }
  const time = new Date();
  let repeat: (() => Promise<T>) | undefined;
  async function complete(data: T) {
    opts.refresh?.();
    if (opts.success) {
      const message = typeof opts.success === "function" ? opts.success(data) : opts.success;
      await (opts.successType === "info" ? toastInfo(message) : toastSuccess(message));
    }
    return { ok: true as const, data };
  }
  try {
    if (isOffline()) throw new ConnectionError("offline");
    const reason = opts.prepare ? await opts.prepare() : opts.reason ? await promptReason(opts.reason) : "";
    if (reason === null || (opts.confirm && !(await confirmAction(opts.confirm)))) return { ok: false };
    if (isOffline()) throw new ConnectionError("offline");
    repeat = opts.connection?.idempotent || opts.connection?.timeoutMs
      ? () => withConnectionDeadline(signal => opts.run(reason, signal), opts.connection?.timeoutMs ?? 15_000)
      : () => opts.run(reason);
    opts.setPending?.(true);
    waiting = true;
    slowTimer = setTimeout(() => {
      void Promise.resolve(hideLoading()).then(() => { if (waiting) void slowConnectionToast(); });
    }, 8000);
    if (opts.connection?.showLoading !== false) timer = setTimeout(() => {
      void loadSwal().then((Swal) => {
        if (!waiting || !showLoading) return;
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
    const data = await repeat();
    await stopLoading();
    return await complete(data);
  } catch (error) {
    await stopLoading();
    try {
      const issue = connectionError(error);
      if (issue && repeat && (issue.sent || issue.kind !== "offline")) {
        const safe = opts.connection?.idempotent === true;
        const result = await showConnectionDialog({
          ...opts.connection, time, retry: safe || opts.connection?.statusRetry ? repeat : undefined,
        }, safe);
        if (result.recovered) return await complete(result.data);
      } else if (opts.errorType === "toast") await toastError(error);
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
