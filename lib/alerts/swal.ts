"use client";

import type { SweetAlertOptions } from "sweetalert2";

export async function loadSwal() {
  return (await import("sweetalert2")).default;
}

export function alertTheme(): SweetAlertOptions {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return {
    heightAuto: false,
    scrollbarPadding: false,
    reverseButtons: true,
    returnFocus: true,
    buttonsStyling: false,
    customClass: {
      popup: "dashboard-alert",
      title: "dashboard-alert-title",
      htmlContainer: "dashboard-alert-text",
      confirmButton: "dashboard-alert-button dashboard-alert-confirm",
      cancelButton: "dashboard-alert-button dashboard-alert-cancel",
      input: "dashboard-alert-input",
    },
    ...(reduced && {
      showClass: { popup: "", backdrop: "", icon: "" },
      hideClass: { popup: "", backdrop: "", icon: "" },
    }),
  };
}

// SweetAlert resolves fire() when dismissal starts. Wait for disposal before
// opening another popup so the old animation and focus cleanup can finish.
export function openDialog<T = unknown>(Swal: Awaited<ReturnType<typeof loadSwal>>, options: SweetAlertOptions) {
  let onClosed: () => void = () => {};
  const closed = new Promise<void>((resolve) => { onClosed = resolve; });
  const result = Swal.fire<T>({ ...options, didDestroy: onClosed });
  const popup = Swal.getPopup();

  return {
    result: result.then(async (response) => {
      await closed;
      return response;
    }),
    async close() {
      if (popup && Swal.getPopup() === popup) Swal.close();
      await closed;
    },
  };
}
