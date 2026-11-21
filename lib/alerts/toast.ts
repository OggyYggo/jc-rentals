"use client";

import { friendlyError } from "./errors";
import { alertTheme, loadSwal } from "./swal";

async function toast(icon: "success" | "error" | "info", message: string) {
  try {
    const Swal = await loadSwal();
    if (Swal.isVisible() && Swal.getPopup()?.classList.contains("swal2-modal")) return;
    const theme = alertTheme();
    delete theme.heightAuto;
    delete theme.returnFocus;
    void Swal.fire({
      ...theme,
      icon,
      titleText: message,
      toast: true,
      position: window.matchMedia("(max-width: 639px)").matches ? "top" : "top-end",
      timer: icon === "error" ? 6000 : 3200,
      timerProgressBar: true,
      showConfirmButton: false,
      willOpen: (popup) => popup.setAttribute("role", "status"),
      didOpen: (popup) => {
        popup.onmouseenter = () => Swal.stopTimer();
        popup.onmouseleave = () => Swal.resumeTimer();
      },
    });
  } catch {
    // Feedback must not change the result of a completed action.
  }
}

export const toastSuccess = (message: string) => toast("success", message);
export const toastError = (error: unknown) => toast("error", friendlyError(error).text);
export const toastInfo = (message: string) => toast("info", message);
