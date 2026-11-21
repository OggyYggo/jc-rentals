"use client";

import { runWithAlerts } from "@/lib/alerts/run";
import { promptReason } from "@/lib/alerts/confirm";
import { alertTheme, loadSwal, openDialog } from "@/lib/alerts/swal";
import { createClient } from "@/lib/supabase/client";
import { refundMoney, refundOwnerCopy } from "@/lib/cancellation";

type Mode = "auto" | "full_refund" | "apply_policy" | "no_show";
type Preview = { can_cancel: boolean; error: string; paid: number; fee: number; refund: number };

async function customerReason(title: string, summary: string, label: string) {
  const Swal = await loadSwal();
  const reason = document.createElement("select");
  reason.className = "swal2-select";
  reason.style.width = "100%";
  reason.setAttribute("aria-label", "Reason for cancelling");
  for (const option of ["Choose a reason", "Change of plans", "Travel disruption", "Booked by mistake", "Other"]) {
    reason.add(new Option(option, option === "Choose a reason" ? "" : option));
  }

  const note = document.createElement("textarea");
  note.className = "swal2-textarea";
  note.style.cssText = "width:100%; margin:0.5rem 0 0";
  note.placeholder = "Add a note (optional)";
  note.setAttribute("aria-label", note.placeholder);
  note.maxLength = 250;

  const content = document.createElement("div");
  const description = document.createElement("p");
  description.textContent = summary;
  content.append(description, reason, note);

  const result = await openDialog<string>(Swal, {
    ...alertTheme(), titleText: title, html: content, showCancelButton: true,
    confirmButtonText: label, cancelButtonText: "Keep booking", focusCancel: true,
    preConfirm: () => {
      if (!reason.value) {
        Swal.showValidationMessage("Choose a cancellation reason.");
        reason.focus();
        return false;
      }
      return [reason.value, note.value.trim()].filter(Boolean).join(" · ");
    },
  }).result;
  return result.isConfirmed ? result.value ?? null : null;
}

export function cancelWithPreview({
  booking, mode = "auto", customer = false, refresh, setPending,
}: {
  booking: { id: string; reference: string };
  mode?: Mode;
  customer?: boolean;
  refresh: () => void;
  setPending: (pending: boolean) => void;
}) {
  const db = createClient();
  const request = { p_booking_id: booking.id, p_mode: mode };
  return runWithAlerts({
    prepare: async () => {
      async function getPreview() {
        setPending(true);
        const { data, error } = await db.rpc("cancellation_preview", request);
        setPending(false);
        if (error) throw error;
        const preview = data as Preview;
        if (!preview.can_cancel) throw new Error(preview.error);
        return preview;
      }
      let preview = await getPreview();
      const title = mode === "no_show" ? `Record a no-show for ${booking.reference}?` : `Cancel booking ${booking.reference}?`;
      while (true) {
        const summary = `Verified payment ${refundMoney(preview.paid)}. Fee kept ${refundMoney(preview.fee)}. Refund ${refundMoney(preview.refund)}.`
          + (preview.refund > 0 ? ` ${refundOwnerCopy}` : "");
        const label = customer && preview.refund > 0 ? `Cancel and request refund of ${refundMoney(preview.refund)}` : mode === "no_show" ? "Record no-show" : "Cancel booking";
        const reason = await (customer ? customerReason(title, summary, label)
          : promptReason({ title, text: summary, label: mode === "no_show" ? "Reason for recording a no-show" : "Reason for cancelling", confirmText: label }));
        if (reason === null) return null;
        const latest = await getPreview();
        if (latest.paid === preview.paid && latest.fee === preview.fee && latest.refund === preview.refund) return reason;
        preview = latest;
      }
    },
    run: async (reason) => {
      const { data, error } = await db.rpc("cancel_booking", { ...request, p_reason: reason });
      if (error) throw error;
      return data as Preview;
    },
    success: result => result.refund > 0 ? `Booking cancelled. Refund pending for ${refundMoney(result.refund)}.` : "Booking cancelled",
    refresh,
    setPending,
  });
}
