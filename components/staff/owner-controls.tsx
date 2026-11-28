"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { ResponsiveSheet } from "@/components/ui/responsive-sheet";
import { toastSuccess } from "@/lib/alerts/toast";
import { inviteStaff, resendStaffInvite, setStaffStatus } from "@/lib/staff/actions";
import { staffAbilities, staffResponsibility } from "@/lib/staff/content";
import type { OwnerStaffRow } from "@/lib/staff/context";
import { StaffRules, staffAction, staffInput, staffPrimary } from "./shared";

export function InviteStaff({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <Dialog.Root open={open} onOpenChange={value => {
    if (!busy) { setOpen(value); setError(""); }
  }}>
    <Dialog.Trigger className={staffPrimary} disabled={disabled}>Invite staff</Dialog.Trigger>
    <ResponsiveSheet className="sm:w-[min(520px,calc(100%-2rem))]!">
      <Dialog.Title className="font-heading text-xl font-bold">Invite handover staff</Dialog.Title>
      <Dialog.Description className="mt-1 text-[#5B6F89]">They will sign in with their own email and password.</Dialog.Description>
      <form className="mt-4 space-y-3" onSubmit={async event => {
        event.preventDefault();
        if (busy) return;
        const form = new FormData(event.currentTarget);
        setBusy(true); setError("");
        try {
          const result = await inviteStaff(String(form.get("name") ?? ""), String(form.get("email") ?? ""));
          if (result.error) setError(result.error);
          else if (result.message) { setOpen(false); void toastSuccess(result.message); }
        } catch { setError("Could not send the invitation. Check the staff list before trying again."); }
        finally { setBusy(false); }
      }}>
        <label className="block font-semibold">Name<input name="name" required maxLength={100} className={staffInput} /></label>
        <label className="block font-semibold">Email<input name="email" type="email" required maxLength={254} className={staffInput} /></label>
        <div className="space-y-2 rounded-xl bg-[#F3F9FF] p-3">
          <p className="font-semibold">They will be able to</p><StaffRules items={staffAbilities.slice(0,3)} />
        </div>
        <p className="text-[#5B6F89]">{staffResponsibility} You can remove them any time.</p>
        {error && <p role="alert" className="text-[#A12A2A]">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Dialog.Close disabled={busy} className={staffAction}>Cancel</Dialog.Close>
          <button className={staffPrimary} disabled={busy}>{busy ? "Sending…" : "Send invite"}</button>
        </div>
      </form>
    </ResponsiveSheet>
  </Dialog.Root>;
}

export function StaffAccessActions({ row }: { row: OwnerStaffRow }) {
  const router = useRouter();
  const [remove, setRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function change(action: "active" | "paused" | "removed" | "resend") {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const result = await (action === "resend" ? resendStaffInvite(row.id) : setStaffStatus(row.id,action));
      if (result.error) setError(result.error);
      else if (result.message) {
        setRemove(false);
        void toastSuccess(result.message);
        router.refresh();
      }
    } catch { setError("Could not complete the request. Refresh and try again."); }
    finally { setBusy(false); }
  }
  if (row.status === "removed") return null;
  return <div className="space-y-2">
    <div className="flex flex-wrap gap-2">
      <button className={staffAction} type="button" disabled={busy}
        onClick={() => void change(row.status === "invited" ? "resend" : row.status === "active" ? "paused" : "active")}>
        {row.status === "invited" ? "Resend invite" : row.status === "active" ? "Pause access" : "Resume access"}
      </button>
      <Dialog.Root open={remove} onOpenChange={open => { if (!busy) setRemove(open); }}>
        <Dialog.Trigger className={`${staffAction} text-[#A12A2A]!`} disabled={busy}>{row.status === "invited" ? "Cancel invite" : "Remove"}</Dialog.Trigger>
        <ResponsiveSheet>
          <Dialog.Title className="break-words font-heading text-xl font-bold">Remove {row.display_name}?</Dialog.Title>
          <Dialog.Description className="mt-2 text-[#5B6F89]">They will lose access right away. Past handovers stay in your history.</Dialog.Description>
          {error && <p role="alert" className="mt-2 text-[#A12A2A]">{error}</p>}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Dialog.Close className={staffAction} disabled={busy}>Cancel</Dialog.Close>
            <button className={`${staffPrimary} bg-[#A12A2A]!`} type="button" disabled={busy} onClick={() => void change("removed")}>Remove</button>
          </div>
        </ResponsiveSheet>
      </Dialog.Root>
    </div>
    {error && !remove && <p role="alert" className="text-[#A12A2A]">{error}</p>}
  </div>;
}
