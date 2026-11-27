"use client";

import { friendlyError } from "./errors";
import { alertTheme, loadSwal } from "./swal";

async function toast(icon: "success" | "error" | "info", message: string, options?: { duration: number; retry?: () => void; pending?: AbortSignal; tone: string }) {
  try {
    const Swal = await loadSwal();
    if (Swal.isVisible() && Swal.getPopup()?.classList.contains("swal2-modal")) return;
    if (options?.pending?.aborted) return;
    const theme = alertTheme();
    delete theme.heightAuto;
    delete theme.returnFocus;
    void Swal.fire({
      ...theme,
      icon,
      titleText: message,
      toast: true,
      position: window.matchMedia("(max-width: 639px)").matches ? "top" : "top-end",
      customClass: { ...theme.customClass, popup: `dashboard-alert ${options?.tone ?? ""}` },
      timer: options?.duration ?? (icon === "error" ? 6000 : 3200),
      timerProgressBar: true,
      showConfirmButton: Boolean(options?.retry),
      confirmButtonText: "Retry",
      willOpen: (popup) => popup.setAttribute("role", "status"),
      didOpen: (popup) => {
        options?.pending?.addEventListener("abort", () => {
          if (Swal.getPopup() === popup) Swal.close();
        }, { once: true });
        popup.onmouseenter = () => Swal.stopTimer();
        popup.onmouseleave = () => Swal.resumeTimer();
      },
    }).then(result => { if (result.isConfirmed && !options?.pending?.aborted) options?.retry?.(); });
  } catch {
    // Feedback must not change the result of a completed action.
  }
}

export const toastSuccess = (message: string) => toast("success", message);
export const toastError = (error: unknown) => toast("error", friendlyError(error).text);
export const toastInfo = (message: string) => toast("info", message);


let lastSlowToast = -Infinity;
export function slowConnectionToast(retry?: () => void, pending?: AbortSignal) {
  if (Date.now() - lastSlowToast < 60_000) return;
  lastSlowToast = Date.now();
  return toast("info", "Slow connection. This may take a bit longer.", { duration: 6000, retry, pending, tone: "connection-slow-toast" });
}

export function backOnlineToast() {
  return toast("success", "You're back online.", { duration: 3200, tone: "connection-online-toast" });
}
