"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { bookingIdPattern } from "@/lib/pickup/model";
import { staffError } from "@/lib/staff/content";
import { staffPrimary } from "./shared";

export function AcceptStaffButton({ token }: { token: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <div className="mt-4 space-y-2">
    <button className={staffPrimary} type="button" disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try {
        const { data, error } = await createClient().rpc("staff_accept_invite", { p_token:token });
        if (error || typeof data !== "string" || !bookingIdPattern.test(data)) setError(staffError(error?.message ?? ""));
        else window.location.replace(`/staff?business=${data}`);
      } catch { setError("Could not accept this invitation. Try again."); }
      finally { setBusy(false); }
    }}>{busy ? "Accepting…" : "Accept and continue"}</button>
    {error && <p role="alert" className="text-[#A12A2A]">{error}</p>}
  </div>;
}
