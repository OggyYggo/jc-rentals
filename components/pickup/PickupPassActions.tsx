"use client";

import { useEffect, useRef, useState } from "react";
import { SubmitButton } from "@/components/loading/SubmitButton";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { runWithAlerts } from "@/lib/alerts/run";
import { toastSuccess } from "@/lib/alerts/toast";
import type { PickupPass } from "@/lib/pickup/model";

export function PickupPassActions({ bookingId, state, rotations = 0 }: {
  bookingId: string; state: PickupPass["state"]; rotations?: number;
}) {
  const router = useRouter();
  const last = useRef(state);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if ((state === "used" || state === "return_ready") && (last.current === "ready" || last.current === "today")) void toastSuccess("Pickup confirmed");
    last.current = state;
    if (state !== "ready" && state !== "today" && state !== "not_ready" && state !== "return_ready") return;
    const refresh = () => { if (document.visibilityState === "visible") router.refresh(); };
    const timer = window.setInterval(refresh, 20_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [router, state]);

  if (state !== "ready" && state !== "today") return null;
  return <SubmitButton unstyled type="button" busy={pending} pendingText="Replacing pass…" disabled={rotations >= 3} className="min-h-11 text-sm font-semibold text-blue-800 underline disabled:opacity-50 max-md:mt-2 max-md:w-full" onClick={() => void runWithAlerts({
    confirm: { title: "Replace this pickup pass?", text: "The QR and backup code on any saved images will stop working.", confirmText: "Replace pass" },
    run: async () => {
      const { error } = await createClient().rpc("rotate_my_pickup_pass", { p_booking: bookingId });
      if (error) throw error;
    },
    refresh: router.refresh,
    success: "Pickup pass replaced",
    setPending,
  })}>{rotations >= 3 ? "Replacement limit reached" : <><span className="md:hidden">Get a new code</span><span className="hidden md:inline">I think my pass was shared</span></>}</SubmitButton>;
}
